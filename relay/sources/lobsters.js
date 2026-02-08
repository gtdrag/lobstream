// Lobsters (lobste.rs) source connector — tech news aggregator.
// Public JSON API, no auth needed.

import { addMessage } from '../lib/redis.js';
import { isMostlyEnglish } from '../lib/normalize.js';

let classify = null;
try {
  const mod = await import('../lib/classify.js');
  classify = mod.classify;
} catch {}

let aiEnqueue = null;
try {
  const mod = await import('../lib/ai-batch.js');
  aiEnqueue = mod.enqueue;
} catch {}

// ── Config ──────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 90_000;  // 90 seconds between polls
const MIN_TEXT_LENGTH = 10;

// ── Dedup ───────────────────────────────────────────────────────────────────

const seen = new Set();
const MAX_SEEN = 2_000;

function markSeen(id) {
  seen.add(id);
  if (seen.size > MAX_SEEN) {
    const pruneCount = Math.floor(MAX_SEEN * 0.2);
    let deleted = 0;
    for (const key of seen) {
      if (deleted >= pruneCount) break;
      seen.delete(key);
      deleted++;
    }
  }
}

// ── Polling ─────────────────────────────────────────────────────────────────

async function poll() {
  let data;

  try {
    const res = await fetch('https://lobste.rs/newest.json', {
      headers: { 'User-Agent': 'lobstream-relay/1.0' },
    });
    if (!res.ok) {
      console.error(`[lobsters] HTTP ${res.status}`);
      return;
    }
    data = await res.json();
  } catch (err) {
    console.error('[lobsters] fetch error:', err.message);
    return;
  }

  if (!Array.isArray(data)) return;

  let count = 0;
  for (const story of data) {
    if (!story.short_id || seen.has(story.short_id)) continue;
    markSeen(story.short_id);

    const text = (story.title || '').trim();
    if (text.length < MIN_TEXT_LENGTH) continue;
    if (!isMostlyEnglish(text)) continue;

    const author = story.submitter_user?.username || 'anonymous';
    const tags = (story.tags || []).join(', ');

    let topics = [];
    let confidence = 0;
    if (classify) {
      const result = classify(text);
      if (result) {
        topics = result.topics;
        confidence = result.confidence;
      }
    }

    const msg = {
      source: 'lobsters',
      text: tags ? `${text} [${tags}]` : text,
      author,
      topics,
      confidence,
    };

    if (topics.length > 0 && aiEnqueue) {
      aiEnqueue(msg);
    } else {
      await addMessage(msg);
    }
    count++;
  }

  if (count > 0) {
    console.log(`[lobsters] ${count} new stories`);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function startLobsters() {
  let running = true;
  let timeoutId = null;

  console.log('[lobsters] Starting — monitoring lobste.rs/newest');

  async function loop() {
    while (running) {
      try {
        await poll();
      } catch (err) {
        console.error('[lobsters] Unexpected error:', err.message);
      }
      if (!running) break;
      await new Promise((resolve) => {
        timeoutId = setTimeout(resolve, POLL_INTERVAL_MS);
      });
    }
  }

  loop();

  return {
    stop() {
      running = false;
      if (timeoutId) clearTimeout(timeoutId);
      console.log('[lobsters] Stopped');
    },
  };
}
