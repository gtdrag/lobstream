// GitHub public events connector — streams activity from AI-related repos.
// No auth needed (60 requests/hour limit).

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

// Poll specific AI repos for events + the global public events feed
const AI_REPOS = [
  'openai/openai-cookbook',
  'langchain-ai/langchain',
  'anthropics/anthropic-cookbook',
  'huggingface/transformers',
  'ollama/ollama',
  'ggerganov/llama.cpp',
  'microsoft/autogen',
  'Significant-Gravitas/AutoGPT',
];

const POLL_INTERVAL_MS = 120_000;  // 2 minutes (conserve rate limit)
const REQUEST_DELAY_MS = 3_000;    // 3s between requests
const MIN_TEXT_LENGTH = 15;
const USER_AGENT = 'lobstream-relay/1.0';

// ── Dedup ───────────────────────────────────────────────────────────────────

const seen = new Set();
const MAX_SEEN = 5_000;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Event extraction ────────────────────────────────────────────────────────

function extractText(event) {
  const repo = event.repo?.name || '';
  const actor = event.actor?.login || 'someone';

  switch (event.type) {
    case 'PushEvent': {
      const commits = event.payload?.commits || [];
      if (commits.length === 0) return null;
      // Use the most recent commit message
      const msg = commits[commits.length - 1]?.message || '';
      const firstLine = msg.split('\n')[0].trim();
      if (!firstLine) return null;
      return `${actor} pushed to ${repo}: ${firstLine}`;
    }
    case 'IssuesEvent': {
      const action = event.payload?.action || 'opened';
      const title = event.payload?.issue?.title || '';
      if (!title) return null;
      return `${actor} ${action} issue on ${repo}: ${title}`;
    }
    case 'IssueCommentEvent': {
      const body = (event.payload?.comment?.body || '').slice(0, 200);
      if (!body) return null;
      return `${actor} commented on ${repo}: ${body}`;
    }
    case 'PullRequestEvent': {
      const action = event.payload?.action || 'opened';
      const title = event.payload?.pull_request?.title || '';
      if (!title) return null;
      return `${actor} ${action} PR on ${repo}: ${title}`;
    }
    case 'WatchEvent':
      return `${actor} starred ${repo}`;
    case 'ForkEvent':
      return `${actor} forked ${repo}`;
    case 'CreateEvent': {
      const refType = event.payload?.ref_type || 'repository';
      const ref = event.payload?.ref || '';
      return ref
        ? `${actor} created ${refType} ${ref} in ${repo}`
        : `${actor} created ${refType} ${repo}`;
    }
    default:
      return null;
  }
}

// ── Polling ─────────────────────────────────────────────────────────────────

async function pollRepoEvents(repo) {
  const url = `https://api.github.com/repos/${repo}/events?per_page=15`;
  let data;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) {
      if (res.status === 403) return []; // Rate limited
      console.error(`[github] ${repo} HTTP ${res.status}`);
      return [];
    }
    data = await res.json();
  } catch (err) {
    console.error(`[github] ${repo} fetch error:`, err.message);
    return [];
  }

  if (!Array.isArray(data)) return [];

  const posts = [];
  for (const event of data) {
    if (!event.id || seen.has(event.id)) continue;
    markSeen(event.id);

    const text = extractText(event);
    if (!text || text.length < MIN_TEXT_LENGTH) continue;
    if (!isMostlyEnglish(text)) continue;

    posts.push({ text, author: event.actor?.login || 'anonymous' });
  }

  return posts;
}

async function pollCycle() {
  let totalNew = 0;

  for (const repo of AI_REPOS) {
    try {
      const posts = await pollRepoEvents(repo);
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
          source: 'github',
          text: post.text,
          author: post.author,
          topics,
          confidence,
        };

        if (topics.length > 0 && aiEnqueue) {
          aiEnqueue(msg);
        } else {
          await addMessage(msg);
        }
      }
    } catch (err) {
      console.error(`[github] Error processing ${repo}:`, err.message);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  if (totalNew > 0) {
    console.log(`[github] Poll cycle: ${totalNew} new events across ${AI_REPOS.length} repos`);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function startGithub() {
  let running = true;
  let timeoutId = null;

  console.log(`[github] Starting — monitoring ${AI_REPOS.length} AI repos`);

  async function loop() {
    while (running) {
      try {
        await pollCycle();
      } catch (err) {
        console.error('[github] Unexpected error:', err.message);
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
      console.log('[github] Stopped');
    },
  };
}
