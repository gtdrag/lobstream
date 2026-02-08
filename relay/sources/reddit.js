// Reddit source connector — polls AI-focused subreddits via public JSON API.
// No auth needed: append .json to any subreddit URL.
// Rate limit: 1 request per 2 seconds, custom User-Agent required.

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

const SUBREDDITS = [
  'artificial',
  'MachineLearning',
  'ChatGPT',
  'ClaudeAI',
  'LocalLLM',
  'singularity',
  'StableDiffusion',
  'Futurology',
];

const POLL_INTERVAL_MS = 60_000;    // 1 minute between full cycles
const REQUEST_DELAY_MS = 2_500;     // 2.5s between requests (Reddit wants <1/sec)
const MIN_TEXT_LENGTH = 15;
const USER_AGENT = 'lobstream-relay/1.0 (art installation; contact: github.com/gtdrag/lobstream)';

// ── Dedup ───────────────────────────────────────────────────────────────────

const seen = new Set();
const MAX_SEEN = 10_000;

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

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Subreddit polling ───────────────────────────────────────────────────────

async function pollSubreddit(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=25&raw_json=1`;
  let data;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) {
      if (res.status === 429) {
        console.warn(`[reddit] r/${subreddit} rate limited, backing off`);
        return [];
      }
      console.error(`[reddit] r/${subreddit} HTTP ${res.status}`);
      return [];
    }
    data = await res.json();
  } catch (err) {
    console.error(`[reddit] r/${subreddit} fetch error:`, err.message);
    return [];
  }

  const posts = [];
  const children = data?.data?.children || [];

  for (const child of children) {
    const post = child.data;
    if (!post || !post.name) continue;
    if (seen.has(post.name)) continue;
    markSeen(post.name);

    // Use title + selftext for self posts, just title for links
    let text = post.title || '';
    if (post.selftext && post.selftext.length > 0) {
      text += ' — ' + post.selftext;
    }
    text = decodeEntities(text);

    // Truncate very long posts
    if (text.length > 500) text = text.slice(0, 500) + '...';
    if (text.length < MIN_TEXT_LENGTH) continue;
    if (!isMostlyEnglish(text)) continue;

    const author = post.author || 'anonymous';

    // Extract image URL from Reddit post
    let imageUrl = null;
    const preview = post.preview?.images?.[0]?.source?.url;
    if (preview) {
      imageUrl = preview.replace(/&amp;/g, '&');
    } else if (post.url && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(post.url)) {
      imageUrl = post.url;
    } else if (post.thumbnail && post.thumbnail.startsWith('http')) {
      imageUrl = post.thumbnail;
    }

    posts.push({ text, author: `u/${author}`, subreddit, imageUrl });
  }

  return posts;
}

// ── Poll cycle ──────────────────────────────────────────────────────────────

async function pollCycle() {
  let totalNew = 0;

  for (const sub of SUBREDDITS) {
    try {
      const posts = await pollSubreddit(sub);
      totalNew += posts.length;

      for (const post of posts) {
        let topics = [];
        let confidence = 0;
        if (classify) {
          const result = classify(post.text);
          if (result) {
            topics = result.topics;
            confidence = result.confidence;
          }
        }

        const msg = {
          source: 'reddit',
          text: post.text,
          author: post.author,
          topics,
          confidence,
          imageUrl: post.imageUrl,
        };

        if (topics.length > 0 && aiEnqueue) {
          aiEnqueue(msg);
        } else {
          await addMessage(msg);
        }
      }
    } catch (err) {
      console.error(`[reddit] Error processing r/${sub}:`, err.message);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  if (totalNew > 0) {
    console.log(`[reddit] Poll cycle: ${totalNew} new posts across ${SUBREDDITS.length} subreddits`);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function startReddit() {
  let running = true;
  let timeoutId = null;

  console.log(`[reddit] Starting — monitoring: ${SUBREDDITS.map(s => 'r/' + s).join(', ')}`);

  async function loop() {
    while (running) {
      try {
        await pollCycle();
      } catch (err) {
        console.error('[reddit] Unexpected error:', err.message);
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
      console.log('[reddit] Stopped');
    },
  };
}
