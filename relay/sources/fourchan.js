// ── 4chan Source Connector ───────────────────────────────────────────────────
// Polls 4chan's public JSON API for posts across multiple boards and pushes
// normalised messages into the Redis stream via addMessage().
//
// 4chan API docs: https://github.com/4chan/4chan-API
// Rate limit: 1 request per second (we use 1.1 s between requests).
// No authentication required.

import { addMessage } from '../lib/redis.js';
import { enqueue as aiEnqueue } from '../lib/ai-batch.js';
import { isMostlyEnglish } from '../lib/normalize.js';

// ── Config ──────────────────────────────────────────────────────────────────

const BOARDS = ['pol', 'news', 'g', 'sci', 'biz'];
const POLL_INTERVAL_MS = 60_000;   // 1 minute between full poll cycles
const REQUEST_DELAY_MS = 1_100;    // >1 s between HTTP requests (rate limit)
const MIN_TEXT_LENGTH   = 10;      // skip very short / empty posts

// ── Optional classifier ─────────────────────────────────────────────────────

let classify = null;
try {
  const mod = await import('../lib/classify.js');
  classify = mod.classify;
} catch {
  // classify.js not available — proceed without topic tagging
}

// ── Seen-posts dedup set ────────────────────────────────────────────────────

const seenPosts = new Set();
const MAX_SEEN  = 10_000;

/**
 * Track a post ID. When the set exceeds MAX_SEEN, remove the oldest entries.
 * Sets in JS iterate in insertion order, so we can prune from the front.
 */
function markSeen(postKey) {
  seenPosts.add(postKey);
  if (seenPosts.size > MAX_SEEN) {
    // Delete the oldest 20 % to avoid pruning on every single insert
    const pruneCount = Math.floor(MAX_SEEN * 0.2);
    let deleted = 0;
    for (const key of seenPosts) {
      if (deleted >= pruneCount) break;
      seenPosts.delete(key);
      deleted++;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert 4chan's HTML comment field into plain text.
 *
 * 4chan posts use:
 *   <br>           — newlines
 *   <wbr>          — word-break hints
 *   <span class="quote">&gt;text</span>  — greentext
 *   <a href="…">…</a>                   — quotelinks / external links
 *   HTML entities  — &amp; &lt; &gt; &quot; &#039;
 */
function stripHtml(html) {
  if (!html) return '';

  return html
    // Convert <br> / <wbr> to spaces (collapse into a single space later)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<wbr\s*\/?>/gi, '')
    // Remove all remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x27;/gi, "'")
    // Collapse multiple spaces and trim
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Board polling ───────────────────────────────────────────────────────────

/**
 * Fetch a board's catalog and return new posts as an array of
 * { text, author, board, no } objects.
 */
async function pollBoard(board) {
  const url = `https://a.4cdn.org/${board}/catalog.json`;
  let data;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'lobstream-relay/1.0' },
    });
    if (!res.ok) {
      console.error(`[4chan] /${board}/ catalog fetch failed: HTTP ${res.status}`);
      return [];
    }
    data = await res.json();
  } catch (err) {
    console.error(`[4chan] /${board}/ catalog fetch error:`, err.message);
    return [];
  }

  const newPosts = [];

  // catalog.json returns an array of pages; each page has a "threads" array
  for (const page of data) {
    if (!page.threads) continue;

    for (const thread of page.threads) {
      // Process the OP itself
      processPost(thread, board, newPosts);

      // Some catalog entries include a "last_replies" array with recent posts
      if (Array.isArray(thread.last_replies)) {
        for (const reply of thread.last_replies) {
          processPost(reply, board, newPosts);
        }
      }
    }
  }

  return newPosts;
}

/**
 * If the post hasn't been seen yet, strip its HTML, validate length,
 * and push it onto the results array.
 */
function processPost(post, board, results) {
  if (!post || !post.no) return;

  const postKey = `${board}:${post.no}`;
  if (seenPosts.has(postKey)) return;

  // Mark as seen immediately (even if we skip it) to avoid re-processing
  markSeen(postKey);

  let text = stripHtml(post.com);
  // Strip >>123456789 reply references — meaningless outside 4chan
  text = text.replace(/>>\d{5,}/g, '').replace(/\s+/g, ' ').trim();
  if (!text || text.length < MIN_TEXT_LENGTH) return;
  if (!isMostlyEnglish(text)) return;

  const author = (post.name || 'Anonymous').trim();

  results.push({ text, author, board, no: post.no });
}

// ── Poll cycle ──────────────────────────────────────────────────────────────

async function pollCycle() {
  let totalNew = 0;

  for (const board of BOARDS) {
    try {
      const posts = await pollBoard(board);
      totalNew += posts.length;

      for (const post of posts) {
        // Run classifier if available
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
          source: '4chan',
          text: post.text,
          author: `${post.author} /${post.board}/`,
          topics,
          confidence,
        };
        // Posts with keyword matches go through AI scoring; others go direct
        if (topics.length > 0) {
          aiEnqueue(msg);
        } else {
          await addMessage(msg);
        }
      }
    } catch (err) {
      console.error(`[4chan] Error processing /${board}/:`, err.message);
    }

    // Respect 4chan rate limit: >= 1 second between requests
    await sleep(REQUEST_DELAY_MS);
  }

  if (totalNew > 0) {
    console.log(`[4chan] Poll cycle complete — ${totalNew} new posts across ${BOARDS.length} boards`);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Start the 4chan polling loop.
 * Returns an object with a stop() method to gracefully terminate the loop.
 */
export function startFourchan() {
  let running = true;
  let timeoutId = null;

  console.log(`[4chan] Starting — monitoring boards: ${BOARDS.map((b) => '/' + b + '/').join(', ')}`);

  async function loop() {
    while (running) {
      try {
        await pollCycle();
      } catch (err) {
        console.error('[4chan] Unexpected poll cycle error:', err.message);
      }

      if (!running) break;

      // Wait before next cycle
      await new Promise((resolve) => {
        timeoutId = setTimeout(resolve, POLL_INTERVAL_MS);
      });
    }
  }

  loop();

  return {
    stop() {
      running = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      console.log('[4chan] Stopped');
    },
  };
}
