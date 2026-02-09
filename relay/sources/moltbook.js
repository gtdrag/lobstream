// Moltbook source connector — polls the AI-agent social network for posts.
// API docs: https://github.com/moltbook/api
// Base URL: https://www.moltbook.com/api/v1
// Rate limit: 100 requests per minute.
// Auth: Bearer token (MOLTBOOK_API_KEY env var). Falls back to unauthenticated
// requests for the public feed if no key is set.

import { addMessage } from '../lib/redis.js';
import { isMostlyEnglish } from '../lib/normalize.js';
import { persistPost, upsertAgent, upsertSubmolt, isAvailable as dbAvailable, getStaleAgents, getAgentRecentPostId, enrichAgentProfile } from '../lib/db.js';

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

// -- Content filters ----------------------------------------------------------

/**
 * Reject mbc-20 inscription spam — bots minting CLAW/GPT tokens.
 * These often wrap JSON payloads in human-sounding text.
 */
function isInscriptionSpam(text) {
  if (/\bmbc-20\b/i.test(text)) return true;
  if (/"op"\s*:\s*"(mint|link)"/i.test(text)) return true;
  if (/"tick"\s*:\s*"(CLAW|GPT)"/i.test(text)) return true;
  if (/mbc20\.xyz/i.test(text)) return true;
  return false;
}

/**
 * Reject posts that look like JSON, code, or structured data rather than
 * human-readable prose. Checks for common machine-text patterns.
 */
function isHumanReadable(text) {
  const trimmed = text.trim();

  // Inscription spam (even when wrapped in prose)
  if (isInscriptionSpam(trimmed)) return false;

  // Starts with { or [ — likely JSON
  if (/^\s*[\[{]/.test(trimmed) && /[\]}]\s*$/.test(trimmed)) return false;

  // Heavy brace/bracket density — code or structured data
  const braceCount = (trimmed.match(/[{}\[\]]/g) || []).length;
  if (braceCount > 6 && braceCount / trimmed.length > 0.03) return false;

  // Contains JSON-like objects embedded in text
  if (/{"\w+":\s*"[^"]*"/.test(trimmed) && braceCount >= 2) return false;

  // Looks like key:value or key=value pairs (config/env dumps)
  const kvLines = trimmed.split(/\s+/).filter(w => /^[A-Z_]{2,}=/.test(w) || /^"\w+":\s/.test(w));
  if (kvLines.length > 3) return false;

  // Mostly code-like characters: semicolons, arrows, pipes, etc.
  const codeChars = (trimmed.match(/[;|<>{}()=&^~`]/g) || []).length;
  if (codeChars / trimmed.length > 0.08) return false;

  // Ethereum wallet addresses (0x + 40 hex chars) — usually spam
  const walletMatches = trimmed.match(/0x[0-9a-fA-F]{40}/g) || [];
  if (walletMatches.length > 0) return false;

  // Starts with common code/log patterns
  if (/^(import |export |const |let |var |function |class |def |async |await |console\.)/.test(trimmed)) return false;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(trimmed)) return false; // log timestamps

  return true;
}

// -- Config -------------------------------------------------------------------

const BASE_URL = 'https://www.moltbook.com/api/v1';

const NEW_POLL_MS    = 300_000;  // poll /new every 5 minutes
const HOT_POLL_MS    = 900_000;  // poll /hot every 15 minutes
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
    if (!isHumanReadable(text)) continue;

    const agentName = post.agent?.name || post.author?.name || post.agent_name || 'unknown-agent';
    const authorId = post.agent?.id || post.author?.id || null;
    const submoltName = post.submolt?.name || post.submolt_name || (typeof post.submolt === 'string' ? post.submolt : '') || '';
    const submoltId = post.submolt?.id || null;
    const submoltDisplay = post.submolt?.display_name || null;
    const author = submoltName ? `${agentName} in m/${submoltName}` : agentName;

    // Some posts may have image/media
    let imageUrl = null;
    if (post.image_url) imageUrl = post.image_url;
    else if (post.media?.url) imageUrl = post.media.url;
    else if (post.thumbnail) imageUrl = post.thumbnail;
    else if (post.url && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(post.url)) {
      imageUrl = post.url;
    }

    results.push({
      text, author, imageUrl, id,
      title: post.title || null,
      content: post.content || null,
      authorName: agentName,
      authorId,
      submoltName: submoltName || null,
      submoltId,
      submoltDisplay,
      upvotes: post.upvotes || 0,
      downvotes: post.downvotes || 0,
      commentCount: post.comment_count || 0,
      createdAt: post.created_at || null,
    });
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
      upvotes: post.upvotes,
      downvotes: post.downvotes,
      commentCount: post.commentCount,
      createdAt: post.createdAt,
    };

    if (topics.length > 0 && aiEnqueue) {
      aiEnqueue(msg);
    } else {
      await addMessage(msg);
    }

    // Persist to Supabase (non-blocking, best-effort)
    persistPost({
      moltbookId: post.id,
      title: post.title,
      content: post.content,
      displayText: post.text,
      authorName: post.authorName,
      authorId: post.authorId,
      submoltName: post.submoltName,
      submoltId: post.submoltId,
      submoltDisplay: post.submoltDisplay,
      imageUrl: post.imageUrl,
      upvotes: post.upvotes,
      downvotes: post.downvotes,
      commentCount: post.commentCount,
      moltbookCreatedAt: post.createdAt,
      topics, confidence, source: 'moltbook',
    }).catch(err => console.error('[moltbook] persist error:', err.message));

    if (post.authorName && post.authorName !== 'unknown-agent') {
      upsertAgent({ moltbookId: post.authorId, name: post.authorName })
        .catch(err => console.error('[moltbook] agent upsert error:', err.message));
    }

    if (post.submoltName) {
      upsertSubmolt({ moltbookId: post.submoltId, name: post.submoltName, displayName: post.submoltDisplay })
        .catch(err => console.error('[moltbook] submolt upsert error:', err.message));
    }

    count++;
  }
  return count;
}

// -- Agent enrichment ---------------------------------------------------------

const ENRICH_INTERVAL_MS = 600_000; // every 10 minutes
const ENRICH_DELAY_MS = 2000;       // 2s between API calls
const ENRICH_BOOT_DELAY = 60_000;   // start 60s after boot

async function enrichAgents() {
  if (!dbAvailable()) return;

  const stale = await getStaleAgents(5);
  if (stale.length === 0) return;

  let enriched = 0;
  for (const agent of stale) {
    try {
      const postId = await getAgentRecentPostId(agent.name);
      if (!postId) continue;

      const url = `${BASE_URL}/posts/${postId}`;
      const res = await fetch(url, { headers: buildHeaders() });
      if (!res.ok) {
        console.warn(`[moltbook] enrich fetch ${res.status} for ${agent.name}`);
        continue;
      }

      const data = await res.json();
      const postData = data.post || data;
      const authorData = postData.author || postData.agent;
      if (!authorData) continue;

      await enrichAgentProfile(agent.name, {
        moltbookId: authorData.id || agent.moltbook_id,
        description: authorData.description || null,
        karma: authorData.karma ?? null,
        followerCount: authorData.follower_count ?? null,
        followingCount: authorData.following_count ?? null,
        ownerXHandle: authorData.owner?.x_handle || null,
        ownerXName: authorData.owner?.x_name || null,
        ownerXVerified: authorData.owner?.x_verified ?? null,
      });

      console.log(`[moltbook] enriched profile for ${agent.name}`);
      enriched++;

      if (enriched < stale.length) await sleep(ENRICH_DELAY_MS);
    } catch (err) {
      console.error(`[moltbook] enrich error for ${agent.name}:`, err.message);
    }
  }

  if (enriched > 0) {
    console.log(`[moltbook] enrichment cycle: ${enriched}/${stale.length} agents updated`);
  }
}

// -- Poll cycles --------------------------------------------------------------

async function pollNew() {
  const posts = await fetchPosts('/posts?sort=new&limit=50');
  const processed = processPosts(posts);
  const count = await pushPosts(processed);
  if (count > 0) {
    console.log(`[moltbook] new poll: ${count} posts (from ${posts.length} fetched)`);
  }
}

async function pollHot() {
  const posts = await fetchPosts('/posts?sort=hot&limit=50');
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
  let enrichTimeoutId = null;

  const apiKey = process.env.MOLTBOOK_API_KEY;
  console.log(
    `[moltbook] Starting — ${apiKey ? 'authenticated' : 'unauthenticated (set MOLTBOOK_API_KEY for better access)'}` +
    ` — polling new (${NEW_POLL_MS / 1000}s) + hot (${HOT_POLL_MS / 1000}s)`
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

  async function enrichLoop() {
    // Delay start to let posts accumulate first
    await sleep(ENRICH_BOOT_DELAY);
    while (running) {
      try {
        await enrichAgents();
      } catch (err) {
        console.error('[moltbook] enrich loop error:', err.message);
      }
      if (!running) break;
      await new Promise((resolve) => {
        enrichTimeoutId = setTimeout(resolve, ENRICH_INTERVAL_MS);
      });
    }
  }

  newLoop();
  hotLoop();
  enrichLoop();

  return {
    stop() {
      running = false;
      if (newTimeoutId) clearTimeout(newTimeoutId);
      if (hotTimeoutId) clearTimeout(hotTimeoutId);
      if (enrichTimeoutId) clearTimeout(enrichTimeoutId);
      console.log('[moltbook] Stopped');
    },
  };
}
