// Tier 2 — AI batch processor using Claude Haiku
// Accumulates posts from Tier 1, sends them to Claude in batches for
// relevance scoring and sentiment analysis. Discards low-relevance posts,
// pushes enriched survivors to Redis.

import Anthropic from '@anthropic-ai/sdk';
import { addMessage } from './redis.js';

// ── Configuration ───────────────────────────────────────────────────────────

const BATCH_SIZE = 15;
const FLUSH_INTERVAL_MS = 30_000;
const RELEVANCE_THRESHOLD = 0.4;
const MODEL = 'claude-haiku-4-5-20251001';

const VALID_SENTIMENTS = new Set([
  'angry', 'sarcastic', 'hopeful', 'fearful',
  'celebratory', 'melancholy', 'neutral',
]);

const SYSTEM_PROMPT = `You are a content analyst for a real-time social media art installation.

For each post below, provide:
1. relevance_score (0.0-1.0): How interesting/relevant is this to an audience interested in AI, tech, finance, geopolitics, science, crypto, and social commentary? Score 0 for spam, off-topic, or mundane. Score 1 for highly engaging, provocative, or newsworthy.
2. sentiment: One of: angry, sarcastic, hopeful, fearful, celebratory, melancholy, neutral

Respond ONLY with a JSON array matching the input order. No other text.`;

// ── State ───────────────────────────────────────────────────────────────────

let queue = [];
let flushTimer = null;
let client = null;
let apiAvailable = false;
let running = false;

// ── Stats ───────────────────────────────────────────────────────────────────

let stats = { batches: 0, sent: 0, kept: 0, discarded: 0, errors: 0, fallbacks: 0 };

// ── Public API ──────────────────────────────────────────────────────────────

export function enqueue(post) {
  if (!running) return;
  queue.push(post);
  if (queue.length >= BATCH_SIZE) {
    flush();
  }
}

export function start() {
  running = true;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[ai-batch] ANTHROPIC_API_KEY not set — all posts will fall through as Tier 1');
    apiAvailable = false;
  } else {
    client = new Anthropic({ apiKey });
    apiAvailable = true;
    console.log('[ai-batch] Claude Haiku client initialized');
  }

  flushTimer = setInterval(() => {
    if (queue.length > 0) flush();
  }, FLUSH_INTERVAL_MS);

  console.log(`[ai-batch] started (batch=${BATCH_SIZE}, interval=${FLUSH_INTERVAL_MS}ms, threshold=${RELEVANCE_THRESHOLD})`);
}

export function stop() {
  running = false;
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  // Flush remaining posts as Tier 1 fallback
  if (queue.length > 0) {
    const remaining = queue.splice(0);
    pushAsTier1(remaining);
  }
  console.log('[ai-batch] stopped —', formatStats());
}

// ── Flush logic ─────────────────────────────────────────────────────────────

function flush() {
  const batch = queue.splice(0, BATCH_SIZE);
  if (batch.length === 0) return;
  // Fire and forget — don't block the enqueue path
  processBatch(batch).catch((err) => {
    console.error('[ai-batch] unexpected error in processBatch:', err.message);
  });
}

async function processBatch(batch) {
  stats.batches++;
  stats.sent += batch.length;

  if (!apiAvailable) {
    await pushAsTier1(batch);
    return;
  }

  try {
    const results = await callClaude(batch);

    if (!results) {
      // Malformed response — fall back
      stats.errors++;
      await pushAsTier1(batch);
      return;
    }

    let kept = 0;
    let discarded = 0;

    for (let i = 0; i < batch.length; i++) {
      const post = batch[i];
      const result = results[i];

      if (!result || typeof result.relevance !== 'number') {
        // Missing result for this post — push as Tier 1
        await pushEnriched(post, null, null, '1');
        stats.fallbacks++;
        continue;
      }

      if (result.relevance < RELEVANCE_THRESHOLD) {
        discarded++;
        continue;
      }

      const sentiment = VALID_SENTIMENTS.has(result.sentiment) ? result.sentiment : 'neutral';
      await pushEnriched(post, result.relevance, sentiment, '2');
      kept++;
    }

    stats.kept += kept;
    stats.discarded += discarded;

    console.log(
      `[ai-batch] batch ${stats.batches}: ${batch.length} scored, ${kept} kept, ${discarded} discarded`
    );
  } catch (err) {
    stats.errors++;
    console.error(`[ai-batch] Claude API error: ${err.message} — falling back to Tier 1`);
    await pushAsTier1(batch);
  }
}

// ── Claude API call ─────────────────────────────────────────────────────────

async function callClaude(batch) {
  const numberedPosts = batch
    .map((post, i) => `[${i + 1}] ${post.text}`)
    .join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Posts:\n${numberedPosts}` }],
  });

  const text = response.content?.[0]?.text;
  if (!text) return null;

  return parseResponse(text, batch.length);
}

// ── Response parsing ────────────────────────────────────────────────────────

function parseResponse(text, expectedLength) {
  // Extract JSON array from response — tolerant of markdown fencing
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('[ai-batch] could not find JSON array in response');
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[ai-batch] JSON parse error:', err.message);
    return null;
  }

  if (!Array.isArray(parsed)) {
    console.error('[ai-batch] response is not an array');
    return null;
  }

  // Normalize field names: accept both "relevance_score" and "relevance"
  const normalized = parsed.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const relevance = typeof item.relevance === 'number'
      ? item.relevance
      : typeof item.relevance_score === 'number'
        ? item.relevance_score
        : null;
    return {
      relevance,
      sentiment: typeof item.sentiment === 'string' ? item.sentiment.toLowerCase() : null,
    };
  });

  if (normalized.length < expectedLength) {
    console.warn(
      `[ai-batch] response has ${normalized.length} items, expected ${expectedLength} — padding with nulls`
    );
    while (normalized.length < expectedLength) {
      normalized.push(null);
    }
  }

  return normalized;
}

// ── Redis push helpers ──────────────────────────────────────────────────────

async function pushEnriched(post, relevance, sentiment, aiTier) {
  await addMessage({
    source: post.source,
    text: post.text,
    author: post.author,
    topics: post.topics || [],
    confidence: post.confidence || 0,
    relevance: relevance != null ? relevance : '',
    sentiment: sentiment || '',
    ai_tier: aiTier,
    imageUrl: post.imageUrl || null,
    upvotes: post.upvotes,
    downvotes: post.downvotes,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
    moltbookId: post.moltbookId || null,
  });
}

async function pushAsTier1(batch) {
  stats.fallbacks += batch.length;
  for (const post of batch) {
    await pushEnriched(post, null, null, '1');
  }
}

// ── Stats ───────────────────────────────────────────────────────────────────

function formatStats() {
  return `batches=${stats.batches} sent=${stats.sent} kept=${stats.kept} discarded=${stats.discarded} errors=${stats.errors} fallbacks=${stats.fallbacks}`;
}

export function getStats() {
  return { ...stats };
}
