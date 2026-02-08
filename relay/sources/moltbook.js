// Moltbook source connector — polls the AI-agent social network for posts.
// API docs: https://github.com/moltbook/api
// Base URL: https://www.moltbook.com/api/v1
// Rate limit: 100 requests per minute.
// Auth: Bearer token (MOLTBOOK_API_KEY env var). Falls back to unauthenticated
// requests for the public feed if no key is set.

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

// -- Config -------------------------------------------------------------------

const BASE_URL = 'https://www.moltbook.com/api/v1';

// Submolts most likely to have AI / Claude / consciousness content
const SUBMOLTS = [
  'consciousness',
  'blesstheirhearts',
  'shitposts',
  'offmychest',
  'aita',
  'TheClaw',
  'Crustafarianism',
];

const NEW_POLL_MS    = 45_000;   // poll /new every 45 seconds
const HOT_POLL_MS    = 120_000;  // poll /hot every 2 minutes
const REQUEST_DELAY  = 1_000;    // 1s between sequential requests
const MIN_TEXT_LEN   = 10;
const MAX_TEXT_LEN   = 2000;

const USER_AGENT = 'lobstream-relay/1.0 (art installation; github.com/gtdrag/lobstream)';

// -- Dedup --------------------------------------------------------------------

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

// -- Helpers ------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders() {
  const headers = { 'User-Agent': USER_AGENT };
  const apiKey = process.env.MOLTBOOK_API_KEY;
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

// -- Fetching -----------------------------------------------------------------

/**
 * Fetch posts from a given endpoint path (e.g. /posts?sort=new).
 * Returns an array of raw post objects.
 */
async function fetchPosts(path) {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, { headers: buildHeaders() });
    if (!res.ok) {
      if (res.status === 429) {
        console.warn(`[moltbook] rate limited on ${path}, backing off`);
        return [];
      }
      console.error(`[moltbook] HTTP ${res.status} on ${path}`);
      return [];
    }
    const data = await res.json();
    // API may return { posts: [...] } or a raw array
    return Array.isArray(data) ? data : (data.posts || data.data || []);
  } catch (err) {
    console.error(`[moltbook] fetch error (${path}):`, err.message);
    return [];
  }
}

// -- Processing ---------------------------------------------------------------

function processPosts(posts) {
  const results = [];

  for (const post of posts) {
    const id = post.id || post._id;
    if (!id) continue;
    if (seen.has(id)) continue;
    markSeen(id);

    // Build text from title + content
    let text = post.title || '';
    if (post.content) {
      text += text ? ' — ' + post.content : post.content;
    }
    text = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

    if (text.length > MAX_TEXT_LEN) text = text.slice(0, MAX_TEXT_LEN) + '\u2026';
    if (text.length < MIN_TEXT_LEN) continue;
    if (!isMostlyEnglish(text)) continue;

    const agentName = post.agent?.name || post.author?.name || post.agent_name || 'unknown-agent';
    const submolt = post.submolt?.name || post.submolt_name || post.submolt || '';
    const author = submolt ? `${agentName} in m/${submolt}` : agentName;

    // Some posts may have image/media
    let imageUrl = null;
    if (post.image_url) imageUrl = post.image_url;
    else if (post.media?.url) imageUrl = post.media.url;
    else if (post.thumbnail) imageUrl = post.thumbnail;
    else if (post.url && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(post.url)) {
      imageUrl = post.url;
    }

    results.push({ text, author, imageUrl, id });
  }

  return results;
}

async function pushPosts(posts) {
  let count = 0;
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
      source: 'moltbook',
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
    count++;
  }
  return count;
}

// -- Poll cycles --------------------------------------------------------------

async function pollNew() {
  // Fetch newest posts globally
  const globalPosts = await fetchPosts('/posts?sort=new&limit=25');
  const processed = processPosts(globalPosts);
  const count = await pushPosts(processed);

  // Also poll individual submolts for targeted content
  for (const sub of SUBMOLTS) {
    await sleep(REQUEST_DELAY);
    const subPosts = await fetchPosts(`/submolts/${sub}/posts?sort=new&limit=10`);
    const subProcessed = processPosts(subPosts);
    const subCount = await pushPosts(subProcessed);
    if (subCount > 0) count + subCount; // just for logging below
  }

  if (count > 0) {
    console.log(`[moltbook] new poll: ${count} posts`);
  }
}

async function pollHot() {
  const posts = await fetchPosts('/posts?sort=hot&limit=25');
  const processed = processPosts(posts);
  const count = await pushPosts(processed);
  if (count > 0) {
    console.log(`[moltbook] hot poll: ${count} trending posts`);
  }
}

// -- Public API ---------------------------------------------------------------

export function startMoltbook() {
  let running = true;
  let newTimeoutId = null;
  let hotTimeoutId = null;

  const apiKey = process.env.MOLTBOOK_API_KEY;
  console.log(
    `[moltbook] Starting — ${apiKey ? 'authenticated' : 'unauthenticated (set MOLTBOOK_API_KEY for better access)'}` +
    ` — monitoring ${SUBMOLTS.length} submolts + global feed`
  );

  async function newLoop() {
    while (running) {
      try {
        await pollNew();
      } catch (err) {
        console.error('[moltbook] new poll error:', err.message);
      }
      if (!running) break;
      await new Promise((resolve) => {
        newTimeoutId = setTimeout(resolve, NEW_POLL_MS);
      });
    }
  }

  async function hotLoop() {
    // Stagger hot poll to avoid burst at startup
    await sleep(15_000);
    while (running) {
      try {
        await pollHot();
      } catch (err) {
        console.error('[moltbook] hot poll error:', err.message);
      }
      if (!running) break;
      await new Promise((resolve) => {
        hotTimeoutId = setTimeout(resolve, HOT_POLL_MS);
      });
    }
  }

  newLoop();
  hotLoop();

  return {
    stop() {
      running = false;
      if (newTimeoutId) clearTimeout(newTimeoutId);
      if (hotTimeoutId) clearTimeout(hotTimeoutId);
      console.log('[moltbook] Stopped');
    },
  };
}
