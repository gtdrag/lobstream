# PRD: AI-Powered Filtering & Sentiment Analysis

## Overview

Add Claude Haiku as a Tier 2 intelligence layer to the Lobstream relay server. Every post that passes the existing keyword pre-filter (Tier 1) gets sent to Claude for two purposes:

1. **Relevance scoring** — Is this post genuinely interesting/relevant, or did it just happen to contain a keyword? Replace false positives with real understanding.
2. **Sentiment tagging** — What is the emotional tone of this post? The frontend color-codes drops by sentiment so viewers can *see* the emotional temperature of the internet at a glance.

Posts that fail AI relevance scoring are discarded. Posts that pass are enriched with sentiment data and pushed to Redis as usual.

---

## Problem Statement

The current Tier 1 keyword classifier has two failure modes:

- **False positives** — A post containing "Apple" about fruit gets tagged as tech. A post mentioning "union" about a wedding gets tagged as politics. Keyword matching has no semantic understanding.
- **No emotional context** — All posts look the same on screen. There's no way to visually distinguish a hopeful post about climate action from a furious rant about billionaires. The stream is visually flat.

---

## Goals

| Goal | Metric |
|------|--------|
| Reduce irrelevant posts reaching the frontend | < 10% false positive rate (vs. ~30% estimated today) |
| Tag every displayed post with a sentiment | 100% of posts reaching frontend have a sentiment tag |
| Keep API costs manageable | < $5/day at current volume (~700 posts/min raw, ~100/min post-keyword-filter) |
| No perceptible latency increase | Posts appear on screen within 5s of source ingestion |
| Visual sentiment differentiation | Viewers can intuitively distinguish emotional tones by color |

---

## Architecture

```
                         Tier 1                    Tier 2
Sources ──► Relay ──► Keyword Filter ──► AI Batch Queue ──► Claude Haiku
              │            │                                      │
              │         (discard)                                 │
              │                                    ┌──────────────┘
              │                                    ▼
              │                              Score + Sentiment
              │                                    │
              │                         (discard if score < 0.4)
              │                                    │
              ▼                                    ▼
           Redis  ◄──────────────────── Enriched post with sentiment
              │
              ▼
         SSE Endpoint ──► Browser ──► Color-coded drops
```

### Key Design Decisions

1. **Batch processing** — Posts are queued and sent to Claude in batches of 10-20 every 5-10 seconds. This reduces API calls by 10-20x vs. per-post calls and stays well within rate limits.

2. **Keyword pre-filter stays** — Tier 1 is free and instant. It eliminates ~85% of posts before they ever touch the API. This keeps costs low and latency minimal.

3. **Async pipeline** — AI scoring happens asynchronously. Posts flow: source → keyword filter → batch queue → Claude → Redis. The batch queue decouples ingestion from scoring so sources are never blocked waiting for AI.

4. **Graceful degradation** — If the Claude API is down or rate-limited, posts fall back to Tier 1 classification only (keywords + no sentiment). The stream never stops.

---

## Sentiment Categories & Color Mapping

| Sentiment | Description | Drop Color | CSS RGB |
|-----------|-------------|------------|---------|
| `angry` | Outrage, fury, frustration | Hot red/orange | `rgb(255, 95, 80)` |
| `sarcastic` | Irony, mockery, dry wit | Electric purple | `rgb(190, 130, 255)` |
| `hopeful` | Optimism, excitement, aspiration | Warm gold | `rgb(255, 215, 100)` |
| `fearful` | Anxiety, dread, warning | Cold blue | `rgb(100, 160, 255)` |
| `celebratory` | Joy, triumph, pride | Bright green | `rgb(100, 230, 150)` |
| `melancholy` | Sadness, loss, nostalgia | Muted teal | `rgb(130, 185, 195)` |
| `neutral` | Informational, matter-of-fact | Existing palette (random) | Current colors |

When sentiment is present, it overrides the random color selection. When absent (fallback/Tier 1 only), the existing random palette is used.

---

## Claude API Integration

### Model

`claude-haiku-4-5-20251001` — Fastest, cheapest Claude model. Ideal for classification tasks.

### Prompt Design

```
You are a content analyst for a real-time social media art installation.

For each post below, provide:
1. relevance_score (0.0-1.0): How interesting/relevant is this to an audience interested in AI, tech, finance, geopolitics, science, crypto, and social commentary? Score 0 for spam, off-topic, or mundane. Score 1 for highly engaging, provocative, or newsworthy.
2. sentiment: One of: angry, sarcastic, hopeful, fearful, celebratory, melancholy, neutral

Respond as a JSON array matching the input order.

Posts:
[1] {post_text_1}
[2] {post_text_2}
...
```

### Response Format

```json
[
  { "relevance": 0.85, "sentiment": "angry" },
  { "relevance": 0.20, "sentiment": "neutral" },
  ...
]
```

### Cost Estimate

- Input: ~150 tokens per post (text + prompt overhead amortized across batch)
- Output: ~20 tokens per post
- Batch of 15 posts: ~2,250 input + 300 output tokens
- Haiku pricing: $0.80/M input, $4/M output
- Per batch: $0.0018 input + $0.0012 output = ~$0.003
- At 6 batches/minute: ~$0.018/min = ~$1.08/hour = ~$26/day

**Cost optimization:** Only process posts that pass Tier 1 keyword filter. Estimated volume: ~70-100 posts/minute after keyword filter → 5-7 batches/minute.

If costs need to go lower:
- Increase batch size (20-30 posts)
- Increase batch interval (15-20 seconds)
- Add a Tier 1.5 dedup/similarity check before batching
- Score only a random sample (e.g., 50% of posts)

---

## Data Flow Changes

### Redis Message Schema (updated)

```
Field         Type      Description
─────────────────────────────────────────────────
source        string    "mastodon", "4chan"
text          string    Post content (unmodified, sacred)
author        string    Username/handle
ts            string    Unix timestamp ms
topics        string    Comma-separated topic tags (from Tier 1)
confidence    string    Tier 1 confidence (0-1)
relevance     string    NEW — AI relevance score (0-1), empty if Tier 1 only
sentiment     string    NEW — AI sentiment tag, empty if Tier 1 only
ai_tier       string    NEW — "1" (keyword only) or "2" (AI scored)
```

### SSE Event (updated)

The `post` event data already includes all Redis fields. No SSE changes needed — `relevance` and `sentiment` fields will automatically flow through.

### Frontend Changes

`rain.js` reads the `sentiment` field from the post data (passed through from `backend-stream.js`). If present, maps it to the corresponding color. If absent, falls back to random color palette.

`backend-stream.js` already forwards all fields from the SSE data object — just needs to include `sentiment` in the queue item.

---

## Implementation Tasks

### Task 1: AI Batch Processor Module
**File:** `relay/lib/ai-batch.js`

Create the core AI processing module:
- Batch queue: accumulates posts, flushes every N seconds or when batch reaches size limit
- Claude API call with the prompt template above
- Parse response, attach relevance + sentiment to each post
- Push enriched posts to Redis via `addMessage()`
- Graceful fallback: if API fails, push posts with Tier 1 data only
- Configurable: batch size, flush interval, relevance threshold, model

**Dependencies:** `@anthropic-ai/sdk` npm package

### Task 2: Integrate AI Batch into Relay Pipeline
**Files:** `relay/sources/mastodon.js`, `relay/sources/fourchan.js`, `relay/index.js`

Change the post flow:
- Currently: source → classify → addMessage (Redis)
- New: source → classify → if topics matched → aiBatch.enqueue(post) → (batch processor handles Redis)
- Posts with no keyword match still go directly to Redis (Tier 1 only, no AI cost)
- Wire up batch processor start/stop in index.js lifecycle

### Task 3: Frontend Sentiment Color-Coding
**Files:** `js/rain.js`, `js/backend-stream.js`

- `backend-stream.js`: include `sentiment` field in queue items
- `rain.js`: add sentiment-to-color mapping table
- `Drop` constructor: if `sentiment` is provided, use mapped color instead of random pick
- Keep random color as fallback for posts without sentiment data (browser-native sources, Tier 1 only posts)

### Task 4: Environment & Deployment
**Files:** `relay/.env.example`, `relay/package.json`

- Add `ANTHROPIC_API_KEY` to environment variables
- Add `@anthropic-ai/sdk` to relay dependencies
- Set API key in Railway environment
- Set API key in relay/.env for local dev
- Update relay/.env.example with placeholder

---

## Acceptance Criteria

- [ ] Posts passing keyword filter are scored by Claude Haiku in batches
- [ ] Posts with relevance < 0.4 are discarded (not pushed to Redis)
- [ ] Posts with relevance >= 0.4 are enriched with sentiment tag
- [ ] Frontend drops are color-coded by sentiment (7 categories)
- [ ] If Claude API is unavailable, posts fall back to Tier 1 (no crash, no data loss)
- [ ] Batch processing does not block source ingestion
- [ ] API costs stay under $30/day at current volume
- [ ] No visible increase in post latency (< 10s source-to-screen)

---

## Out of Scope (Future)

- Tier 3: Full LLM evaluation for edge cases
- Embedding-based semantic search
- User-configurable sentiment filters
- Sentiment analytics dashboard
- AI-generated summaries or poetry (text is sacred)
- Music generation from stream content
