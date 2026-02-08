// Mastodon source connector — polls the public timeline REST API of multiple
// Mastodon instances and feeds normalised posts into Redis.
//
// Uses GET /api/v1/timelines/public (no auth required on most instances).
// Mastodon streaming WebSocket requires auth since v4, so polling is more reliable.

import { addMessage } from '../lib/redis.js';
import { stripHtml } from '../lib/normalize.js';

// ── Configuration ───────────────────────────────────────────────────────────

const INSTANCES = [
  'fosstodon.org',      // FOSS / tech
  'hachyderm.io',       // tech-focused
  'mas.to',            // general
  'mstdn.social',      // general
  'techhub.social',    // tech community
  'social.vivaldi.net', // general / international
];

const POLL_INTERVAL_MS = 15_000;  // poll each instance every 15 seconds
const POSTS_PER_POLL = 20;       // fetch 20 posts per request
const MIN_TEXT_LENGTH = 10;       // skip very short posts
const REQUEST_DELAY_MS = 500;     // delay between instance requests to be polite

// ── Optional classifier ─────────────────────────────────────────────────────

let classify = null;
try {
  const mod = await import('../lib/classify.js');
  classify = mod.classify;
} catch {
  // classify.js not available — proceed without topic tagging
}

// ── Per-instance poller ─────────────────────────────────────────────────────

class MastodonInstance {
  constructor(host) {
    this.host = host;
    this.running = false;
    this.lastSeenId = null;
    this.timeoutId = null;
  }

  start() {
    this.running = true;
    this._poll();
  }

  stop() {
    this.running = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  async _poll() {
    if (!this.running) return;

    try {
      let url = `https://${this.host}/api/v1/timelines/public?limit=${POSTS_PER_POLL}`;
      if (this.lastSeenId) {
        url += `&since_id=${this.lastSeenId}`;
      }

      const res = await fetch(url, {
        headers: { 'User-Agent': 'lobstream-relay/1.0' },
      });

      if (!res.ok) {
        console.error(`[mastodon][${this.host}] HTTP ${res.status}`);
      } else {
        const posts = await res.json();

        if (Array.isArray(posts) && posts.length > 0) {
          // Posts come newest-first; track the newest ID
          this.lastSeenId = posts[0].id;

          let count = 0;
          for (const post of posts) {
            const text = stripHtml(post.content || '').trim();
            if (text.length < MIN_TEXT_LENGTH) continue;

            const username = post.account?.username || 'unknown';
            const author = `${username}@${this.host}`;

            let topics = [];
            let confidence = 0;
            if (classify) {
              const result = classify(text);
              if (result) {
                topics = result.topics;
                confidence = result.confidence;
              }
            }

            await addMessage({ source: 'mastodon', text, author, topics, confidence });
            count++;
          }

          if (count > 0) {
            console.log(`[mastodon][${this.host}] ${count} new posts`);
          }
        }
      }
    } catch (err) {
      console.error(`[mastodon][${this.host}] poll error: ${err.message}`);
    }

    // Schedule next poll
    if (this.running) {
      this.timeoutId = setTimeout(() => this._poll(), POLL_INTERVAL_MS);
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function startMastodon(customInstances) {
  const hosts = customInstances || INSTANCES;

  console.log(`[mastodon] starting ${hosts.length} instance pollers`);

  const instances = [];
  let delay = 0;

  for (const host of hosts) {
    const inst = new MastodonInstance(typeof host === 'string' ? host : host.host);
    // Stagger the starts so we don't hit all instances at once
    setTimeout(() => inst.start(), delay);
    delay += REQUEST_DELAY_MS;
    instances.push(inst);
  }

  return {
    stop() {
      console.log('[mastodon] stopping all instance pollers');
      instances.forEach((inst) => inst.stop());
    },
  };
}
