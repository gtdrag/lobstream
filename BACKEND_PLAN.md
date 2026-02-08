# Lobstream Backend Architecture Plan
## Adding Authenticated Data Sources via Vercel + External Relay

**Date**: February 2026
**Status**: Draft / Ready for Review

---

## Table of Contents

1. [Current Architecture](#1-current-architecture)
2. [Authenticated Sources Ranked](#2-authenticated-sources-ranked)
3. [Backend Architecture](#3-backend-architecture)
4. [API Contract](#4-api-contract)
5. [Secrets Management](#5-secrets-management)
6. [Cost Estimates](#6-cost-estimates)
7. [Phased Rollout](#7-phased-rollout)
8. [File Structure](#8-file-structure)

---

## 1. Current Architecture

Lobstream is a static vanilla JS site deployed on Vercel. There is no backend. The browser connects directly to real-time public streams:

```
Browser
  |-- WebSocket --> Bluesky Jetstream (wss://jetstream2.us-east.bsky.network)
  |-- WebSocket --> Nostr Relays (wss://relay.damus.io, etc.)
  |-- SSE -------> Wikipedia EventStreams (https://stream.wikimedia.org)
  |-- Firebase --> Hacker News (https://hacker-news.firebaseio.com)
```

Each source class (`Jetstream`, `Nostr`, `Wikipedia`, `HackerNews`) follows the same pattern: connect, buffer to a queue, feed via interval timer at ~3 drops/sec, with reconnect/backoff logic. `main.js` orchestrates all sources and feeds text into `Rain.addDrop()`.

**Why a backend is needed**: The four sources above work in the browser because they require zero authentication and have permissive CORS. Every other major social platform either blocks CORS, requires OAuth tokens that cannot be safely embedded in client-side code, or uses server-only protocols (MTProto, gRPC, etc.).

---

## 2. Authenticated Sources Ranked

Ranked by a composite of: real-time data volume, text richness, political diversity (relative to existing sources), and implementation difficulty.

| Rank | Source | Volume | Richness | Political Diversity | Difficulty | Why Include |
|------|--------|--------|----------|-------------------|------------|-------------|
| 1 | **Mastodon** (mastodon.social + 3-5 instances) | High | High (full posts, 500 chars) | Left/progressive (complements Nostr right-lean) | Easy | Free OAuth tokens, WebSocket streaming API, works identically to Jetstream pattern. Covers left-progressive audience absent from other sources. |
| 2 | **4chan** (/pol/, /b/, /news/, /int/) | Very High | Medium (anonymous posts, raw) | Far-right to chaotic center | Easy | Free JSON API, no auth needed, just CORS-blocked. Simple polling proxy. Enormous volume. Unique anonymous voice. |
| 3 | **Reddit** (r/all/new, r/politics, r/news, etc.) | Enormous | High (titles + self-text) | Center-left mainstream | Medium | Free OAuth tier, 60 req/min. Polling-based (no streaming). Mainstream voice. CORS-blocked. |
| 4 | **Telegram** (public channels) | Very High | High (multilingual, global) | All extremes / global | Hard | MTProto or Bot API. Requires phone auth or bot membership. Rich global political content. |
| 5 | **Discord** (public servers) | Very High | High (real-time chat) | All spectrum / community-based | Medium | Bot Gateway WebSocket. Bot must be invited to servers. Rich real-time chat. |
| 6 | **Twitch** (chat from top streams) | Enormous | Low-Medium (short chat msgs) | Neutral/entertainment | Medium | Free EventSub WebSocket API. OAuth required. Enormous volume from popular streams. |
| 7 | **Mastodon-compatible** (Misskey, Pleroma, Akkoma) | Medium | High | Varies widely | Easy | Same streaming API pattern as Mastodon. Misskey.io is one of the largest fediverse instances. Pleroma covers different political demographics. |
| 8 | **YouTube Live Chat** | High (during streams) | Low-Medium (short messages) | Mainstream / varies by stream | Medium-Hard | Polling API with quota limits. 10,000 quota units/day free. Backend required for quota management. |
| 9 | **Threads** (Meta) | High | Medium | Center-left mainstream | Hard | REST API + webhooks only, no streaming. Requires Meta app review. 200M+ users but API is limited. |
| 10 | **Matrix** (public rooms) | Medium | High (threaded discussions) | Neutral / tech / privacy | Medium | Long-polling sync API. Guest access on some homeservers. Rich discussion content. |
| 11 | **Rumble** (live chat) | Low-Medium | Low-Medium | Right/conservative | Easy | Simple REST API. Polling. Conservative creator ecosystem. |
| 12 | **Truth Social** | Low-Medium | Medium | Far-right / Trump-aligned | Hard | Mastodon-fork API, but access is inconsistent. Covers a demographic not found elsewhere. |
| 13 | **Kick** (chat) | Medium | Low-Medium | Right-leaning / entertainment | Medium | Reverse-engineered Pusher WebSocket. No official API. Fragile. |
| 14 | **VK (VKontakte)** | High | High | Russian mainstream | Medium | WebSocket Streaming API with service token. 1% sample of public data. Russian-language content. |
| 15 | **Farcaster** | Low | High (Web3 social) | Crypto-centrist | Medium | gRPC/HTTP via Hubble nodes or Neynar API. Crypto/Web3 demographic. |

### Not Recommended

| Source | Why Skip |
|--------|----------|
| **Twitter/X** | $5,000/month minimum for streaming API. Basic tier ($200/mo) has no streaming. Absurd cost for an art project. |
| **Facebook/Instagram** | No public streaming API. Graph API is locked down. Meta Content Library requires academic approval. |
| **TikTok** | No streaming. API approval is difficult. No real-time capability. |
| **LinkedIn** | No streaming. Extremely restricted API. |
| **Threads** (reconsidered) | Included above at #9 but may not be worth the Meta app review hassle. |

---

## 3. Backend Architecture

### The Core Problem

Vercel is a serverless platform. It does **not** support:
- Persistent WebSocket connections (functions terminate after 10-300s)
- Long-running background processes
- Cron jobs finer than 1/minute (Pro plan)

But many authenticated sources require persistent connections (Discord Gateway, Telegram MTProto, Mastodon WebSocket, Twitch EventSub).

### Recommended Architecture: Hybrid (Vercel + External Relay)

```
                        EXTERNAL RELAY SERVER
                     (Railway / Fly.io / cheap VPS)
                     ==============================
                     |                            |
                     |  Persistent connections:   |
                     |  - Mastodon WebSocket x5   |
                     |  - Discord Gateway         |
                     |  - Telegram MTProto        |
                     |  - Twitch EventSub WS      |
                     |                            |
                     |  Polling loops:            |
                     |  - Reddit /new.json        |
                     |  - 4chan /thread.json       |
                     |  - YouTube liveChatMessages |
                     |  - Rumble API              |
                     |                            |
                     |  Writes to:                |
                     |  -> Upstash Redis stream   |
                     |     (or in-memory ring buf)|
                     ==============================
                              |
                              | XADD to Redis stream
                              | (or HTTP push)
                              v
              ====================================
              |       UPSTASH REDIS              |
              |  (serverless Redis, free tier)   |
              |                                  |
              |  Stream: lobstream:firehose       |
              |  - source: "mastodon"            |
              |  - text: "post content..."       |
              |  - timestamp: 1707350400         |
              |                                  |
              |  Recent buffer: last 500 items   |
              ====================================
                              |
                              | XRANGE / XREAD
                              v
              ====================================
              |     VERCEL SERVERLESS FUNCTION   |
              |     /api/stream (SSE endpoint)   |
              |                                  |
              |  1. Client connects via SSE      |
              |  2. XREAD BLOCK on Redis stream  |
              |  3. Forward new items as SSE     |
              |  4. Timeout after 25s, client    |
              |     reconnects (EventSource      |
              |     handles this automatically)  |
              ====================================
                              |
                              | SSE (Server-Sent Events)
                              v
              ====================================
              |          BROWSER CLIENT          |
              |                                  |
              |  const es = new EventSource(     |
              |    '/api/stream?sources=mastodon, |
              |     reddit,4chan'                 |
              |  );                              |
              |  es.onmessage = (e) => {         |
              |    rain.addDrop(JSON.parse(       |
              |      e.data).text);              |
              |  };                              |
              ====================================
```

### Why This Architecture

| Approach | Persistent Connections | Cost | Complexity | Verdict |
|----------|----------------------|------|------------|---------|
| **Vercel Serverless only** | No (10-60s timeout) | Free tier | Low | Cannot maintain WebSocket connections to sources. Only works for polling sources with very short intervals. |
| **Vercel Edge Functions only** | No (25s streaming limit on Hobby) | Free tier | Low | Can serve SSE to clients but cannot maintain upstream connections. |
| **External relay + Vercel SSE** | Yes (relay holds connections) | ~$5-7/mo relay + free Vercel | Medium | Best balance. Relay handles persistent connections, Vercel serves the frontend and SSE endpoint. |
| **External relay only (no Vercel)** | Yes | ~$5-7/mo | Medium | Loses Vercel's CDN, preview deploys, and zero-config frontend hosting. |
| **Vercel + Vercel Cron** | Polling only (1/min on Pro) | $20/mo Pro plan | Low | Too slow for real-time. 1-minute minimum cron interval. |

### Component Details

#### A. External Relay Server

**Platform**: Railway ($5/mo Hobby plan) or Fly.io ($5/mo minimum)

**Runtime**: Single Node.js process (~50-100MB RAM)

**Responsibilities**:
- Maintain persistent WebSocket/long-poll connections to all authenticated sources
- Normalize incoming messages to a common format: `{ source, text, author, timestamp }`
- Write normalized messages to Upstash Redis stream via `XADD`
- Handle reconnection, rate limiting, and error recovery per source
- Health check endpoint for monitoring

**Why not a VPS?** Railway/Fly.io provide:
- Git-push deploys (same workflow as Vercel)
- Auto-restart on crash
- Environment variable management
- Logs and metrics
- No sysadmin overhead

A $5/mo Hetzner VPS works too if you prefer lower cost and more control.

#### B. Upstash Redis (Message Broker)

**Why Redis Streams?**
- Upstash has a generous free tier (10,000 commands/day, 256MB)
- Redis Streams (`XADD` / `XREAD BLOCK`) are purpose-built for this pattern
- Consumer groups allow multiple SSE function instances to share the load
- Automatic trimming via `MAXLEN` keeps memory bounded
- Serverless-compatible (HTTP-based Upstash REST API, no persistent connection needed from Vercel)

**Alternative**: The relay could hold messages in an in-memory ring buffer and expose an HTTP endpoint that Vercel polls. This eliminates the Redis dependency but means messages are lost if the relay restarts. Redis is better for reliability.

#### C. Vercel SSE Endpoint (`/api/stream`)

A Vercel Serverless Function (or Edge Function) that:

1. Accepts SSE connection from the browser
2. Reads from Redis stream using `XREAD` (blocking or polling)
3. Forwards messages as SSE `data:` events
4. Closes after ~25 seconds (Hobby plan streaming limit)
5. Browser `EventSource` automatically reconnects with `Last-Event-ID`

**Edge vs Serverless for SSE**:
- Edge Functions: lower latency, 25s streaming on Hobby, runs at edge locations
- Serverless (Node.js): 10s default timeout on Hobby (60s on Pro), runs in single region
- **Recommendation**: Use Edge Functions for the SSE endpoint

#### D. Alternative: Polling Endpoint Instead of SSE

If SSE proves problematic on Vercel's free tier, a simpler alternative:

```
GET /api/messages?after={timestamp}&sources=mastodon,reddit
```

Returns last N messages from Redis. Browser polls every 500ms-1s. More function invocations but simpler to implement and debug. The 150K free invocations/month on Hobby = ~3.5 invocations/minute continuously, which is too low for real polling. Would need Pro plan ($20/mo) or careful rate management.

**Verdict**: SSE is strongly preferred over polling.

---

## 4. API Contract

### SSE Endpoint

```
GET /api/stream?sources=mastodon,reddit,4chan,discord&after=1707350400000
```

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sources` | string (comma-separated) | all | Filter by source names |
| `after` | number (unix ms) | 0 | Resume from timestamp (used with `Last-Event-ID`) |

**SSE Event Format**:
```
id: 1707350400123
event: post
data: {"source":"mastodon","text":"Just posted from mastodon.social!","author":"user@mastodon.social","ts":1707350400123}

id: 1707350400456
event: post
data: {"source":"reddit","text":"TIL that lobsters can live to be over 100 years old","author":"u/lobsterfan","ts":1707350400456}

id: 1707350400789
event: post
data: {"source":"4chan","text":"Anonymous posted in /pol/: ...","author":"Anonymous","ts":1707350400789}
```

**Special Events**:
```
event: heartbeat
data: {"ts":1707350400000,"sources":{"mastodon":"connected","reddit":"polling","4chan":"polling","discord":"connected"}}
```

### Source Status Endpoint

```
GET /api/sources
```

Returns current status of all sources:
```json
{
  "sources": {
    "mastodon": { "status": "connected", "messagesPerMinute": 42, "lastMessage": 1707350400123 },
    "reddit": { "status": "polling", "messagesPerMinute": 15, "lastMessage": 1707350399000 },
    "4chan": { "status": "polling", "messagesPerMinute": 8, "lastMessage": 1707350398000 },
    "discord": { "status": "connected", "messagesPerMinute": 120, "lastMessage": 1707350400456 }
  },
  "totalMessagesPerMinute": 185,
  "uptime": 86400
}
```

### Browser Client Integration

```javascript
// js/backend-stream.js
export class BackendStream {
  constructor(onPost, sources = []) {
    this.onPost = onPost;
    this.sources = sources;
    this.eventSource = null;
    this.reconnectDelay = 1000;
  }

  connect() {
    const params = new URLSearchParams();
    if (this.sources.length) params.set('sources', this.sources.join(','));

    this.eventSource = new EventSource(`/api/stream?${params}`);

    this.eventSource.addEventListener('post', (e) => {
      try {
        const data = JSON.parse(e.data);
        this.onPost(data.text);
      } catch (err) {
        // ignore
      }
    });

    this.eventSource.onerror = () => {
      // EventSource auto-reconnects, but we can add logging
    };
  }

  destroy() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
```

---

## 5. Secrets Management

### Vercel Environment Variables

All API keys and tokens stored as Vercel Environment Variables (encrypted at rest, injected at build/runtime):

| Variable | Source | How to Obtain |
|----------|--------|---------------|
| `UPSTASH_REDIS_URL` | Upstash | Create free Redis database at upstash.com |
| `UPSTASH_REDIS_TOKEN` | Upstash | Same as above |
| `MASTODON_TOKEN_SOCIAL` | mastodon.social | `POST /api/v1/apps` then `POST /oauth/token` (automated) |
| `MASTODON_TOKEN_HACHYDERM` | hachyderm.io | Same flow |
| `REDDIT_CLIENT_ID` | Reddit | Create app at reddit.com/prefs/apps |
| `REDDIT_CLIENT_SECRET` | Reddit | Same as above |
| `DISCORD_BOT_TOKEN` | Discord | Create bot at discord.com/developers |
| `TELEGRAM_BOT_TOKEN` | Telegram | Chat with @BotFather |
| `TELEGRAM_API_ID` | Telegram | my.telegram.org (for MTProto) |
| `TELEGRAM_API_HASH` | Telegram | Same as above |
| `TWITCH_CLIENT_ID` | Twitch | dev.twitch.tv/console |
| `TWITCH_CLIENT_SECRET` | Twitch | Same as above |
| `YOUTUBE_API_KEY` | Google | console.cloud.google.com |

### Railway/Fly.io Environment Variables

The relay server needs the same secrets. Both Railway and Fly.io support encrypted environment variables via their dashboards and CLI.

### Security Rules

1. **Never commit secrets to git.** Use `.env.local` for local development (already in `.gitignore`).
2. **Read-only tokens only.** No source requires write access. Generate minimal-scope tokens.
3. **Rotate tokens quarterly.** Set calendar reminders.
4. **Mastodon tokens are low-risk.** They are app-level read-only tokens for public timelines. If leaked, an attacker can only read the public timeline (which is already public). Still, don't leak them.
5. **Reddit tokens are medium-risk.** Tied to your Reddit account. Use a dedicated throwaway account.
6. **Discord bot token is high-risk.** Leaking it gives full bot access. Keep it strictly server-side.

---

## 6. Cost Estimates

### API Access Costs

| Source | API Cost | Notes |
|--------|----------|-------|
| Mastodon (5 instances) | **$0** | Free. OAuth app registration is automated and free. |
| 4chan | **$0** | Free public JSON API. No auth needed. |
| Reddit | **$0** | Free tier for non-commercial/personal projects. 60 req/min with OAuth. |
| Discord | **$0** | Free bot API. Must be invited to servers. |
| Telegram | **$0** | Free Bot API. MTProto client API also free. |
| Twitch | **$0** | Free EventSub API. |
| YouTube Live Chat | **$0** | Free 10,000 quota units/day. Enough for ~200 list calls/day. |
| Matrix | **$0** | Free. Guest access on many homeservers. |
| Rumble | **$0** | Free API for creators. |
| Misskey/Pleroma | **$0** | Free. Same as Mastodon. |
| **Twitter/X** | **$5,000/mo** | **NOT RECOMMENDED.** Streaming requires Pro tier minimum. |

**Total API cost (excluding Twitter): $0/month**

### Infrastructure Costs

| Component | Free Tier | Estimated Monthly Cost |
|-----------|-----------|----------------------|
| **Vercel Hobby** | 150K function invocations, 100GB bandwidth, Edge Functions | **$0** |
| **Vercel Pro** (if needed) | Same + 1M invocations, longer timeouts | **$20/mo** |
| **Upstash Redis Free** | 10K commands/day, 256MB | **$0** |
| **Upstash Redis Pay-as-you-go** | $0.2 per 100K commands | **~$2-5/mo** |
| **Railway Hobby** | $5 credit/mo included | **$5/mo** (likely covered by free credit) |
| **Fly.io** | 3 shared-cpu-1x VMs free | **$0-5/mo** |

### Estimated Total Monthly Cost

| Scenario | Cost |
|----------|------|
| **Minimal** (Vercel Hobby + Fly.io free tier + Upstash free) | **$0/mo** |
| **Comfortable** (Vercel Hobby + Railway $5 + Upstash free) | **$5/mo** |
| **Production** (Vercel Pro + Railway + Upstash paid) | **$25-30/mo** |

### Scaling Concerns

At steady state, the relay server processes maybe 200-500 messages/minute across all sources. This is trivially handled by the smallest available server. The bottleneck would be Redis commands if using Upstash free tier (10K/day = ~7/min), which is too low for production. The pay-as-you-go tier at $0.2/100K commands handles this easily.

**Recommendation**: Start with the **$5/mo Comfortable tier**. Upgrade to Production only if SSE on Vercel Hobby proves too limited (25s timeout, reconnection overhead).

---

## 7. Phased Rollout

### Phase 0: Foundation (Current)
**Status**: In progress
- Browser-native sources: Bluesky, Nostr, Wikipedia, Hacker News
- No backend needed
- **Deliverable**: Multi-source `main.js` orchestrator

### Phase 1: First Backend Sources (Week 1-2)
**Goal**: Prove the architecture with the easiest sources

**Infrastructure**:
- Deploy relay server on Railway/Fly.io
- Set up Upstash Redis
- Create `/api/stream` SSE endpoint on Vercel
- Create `BackendStream` browser client class

**Sources to add**:
1. **Mastodon** (mastodon.social) -- easiest backend source. WebSocket streaming, free token, well-documented API. Near-identical to Jetstream pattern.
2. **4chan** (/pol/, /news/) -- second easiest. Polling proxy, no auth, simple JSON parsing.

**Why these first**: Both are easy to implement, free, and test the two main relay patterns (persistent WebSocket vs polling). Mastodon adds left-progressive content, 4chan adds anonymous/far-right content -- maximum political diversity gain.

### Phase 2: High-Value Sources (Week 3-4)
**Goal**: Add the sources with the most unique content

3. **Reddit** (r/all/new, curated subreddits) -- OAuth setup, polling at 60 req/min
4. **Mastodon** (hachyderm.io, fosstodon.org, mstdn.social) -- more instances, same code
5. **Misskey** (misskey.io) -- similar to Mastodon but different protocol details
6. **Discord** (2-3 public servers like programming, news, gaming) -- Gateway WebSocket, bot token

### Phase 3: Complex Sources (Week 5-8)
**Goal**: Sources that require more implementation effort

7. **Telegram** (public channels via Bot API or MTProto) -- complex auth flow, multilingual content
8. **Twitch** (top 5-10 streams by viewer count, rotating) -- EventSub WebSocket, OAuth
9. **YouTube Live Chat** (top livestreams) -- quota-managed polling, stream discovery logic
10. **Matrix** (public rooms on matrix.org) -- long-polling sync, room discovery

### Phase 4: Niche Sources (Month 2+)
**Goal**: Political diversity and global coverage

11. **Rumble** (live chat) -- conservative creator content
12. **Truth Social** -- if Mastodon-compatible API works
13. **VK** -- Russian-language content
14. **Farcaster** -- Web3/crypto demographic
15. **Kick** -- reverse-engineered Pusher (fragile, low priority)

### Phase 5: Polish
- Source toggle UI (let users enable/disable sources)
- Source-colored drops (each source gets a subtle color tint)
- Rate balancing (prevent one noisy source from drowning others)
- Health dashboard at `/api/sources`
- Monitoring and alerting

---

## 8. File Structure

Proposed project structure after backend is added:

```
lobstream/
  index.html
  css/style.css
  js/
    main.js              # Orchestrator
    rain.js              # Rain rendering
    reflection.js        # Water reflection
    jetstream.js         # Bluesky (browser-direct)
    nostr.js             # Nostr (browser-direct)
    wikipedia.js         # Wikipedia (browser-direct)
    hackernews.js        # HN (browser-direct)
    backend-stream.js    # SSE client for backend sources

  api/
    stream.js            # Vercel Edge Function: SSE endpoint
    sources.js           # Vercel Function: source status

  relay/                 # Deployed separately to Railway/Fly.io
    package.json
    index.js             # Main relay process
    sources/
      mastodon.js        # Mastodon WebSocket consumer
      reddit.js          # Reddit polling consumer
      fourchan.js        # 4chan polling consumer
      discord.js         # Discord Gateway consumer
      telegram.js        # Telegram consumer
      twitch.js          # Twitch EventSub consumer
      youtube.js         # YouTube Live Chat poller
      matrix.js          # Matrix sync consumer
    lib/
      redis.js           # Upstash Redis client
      normalize.js       # Message normalization
      health.js          # Health check endpoint
    Dockerfile           # For Railway/Fly.io deployment
    fly.toml             # Fly.io config (if using Fly)
    railway.json         # Railway config (if using Railway)
```

---

## 9. AI Content Filtering & Topic Detection

### The Concept

The relay server doesn't just aggregate — it **understands** the stream. Every post gets classified by topic so the frontend can filter: show everything, show only AI/tech news, show only posts mentioning OpenClaw/Claude, etc. Clawdbot isn't just watching the internet — he's curating it.

### Architecture: Three-Tier Classification Pipeline

Each message flows through up to three tiers, stopping as soon as it gets a confident classification:

```
Incoming post
  |
  v
Tier 1: KEYWORD MATCH (instant, free)
  |-- matches "AI", "GPT", "Claude", "OpenAI", "LLM", etc.?
  |   -> tag: { topics: ["ai"], confidence: 0.8 }
  |-- matches "OpenClaw", "Clawdbot", "lobstream"?
  |   -> tag: { topics: ["openclaw"], confidence: 0.95 }
  |-- no match? pass to Tier 2
  |
  v
Tier 2: EMBEDDING SIMILARITY (fast, cheap)
  |-- Compute embedding via small model (e.g. Voyage AI, Cohere, or local)
  |-- Compare cosine similarity to pre-computed topic centroids:
  |     "AI/ML news"    -> centroid vector
  |     "Politics"      -> centroid vector
  |     "Crypto/Web3"   -> centroid vector
  |     "Entertainment" -> centroid vector
  |     "Science"       -> centroid vector
  |-- Score > 0.7? -> tag with topic
  |-- Ambiguous? pass to Tier 3
  |
  v
Tier 3: LLM CLASSIFICATION (smart, pennies)
  |-- Batch 10-20 posts together
  |-- Send to Claude Haiku: "Classify each post by topic.
  |    Topics: ai, politics, crypto, entertainment, science, openclaw, other"
  |-- Tag with LLM response
  |
  v
Write to Redis with tags:
  XADD lobstream:firehose * source "mastodon" text "..." topics "ai,openclaw" confidence "0.92"
```

### Tier Details

#### Tier 1: Keyword Matching
- **Cost**: $0 (runs in-process on relay)
- **Latency**: <1ms
- **Accuracy**: High for exact matches, misses nuance
- **Implementation**: Simple regex/set-lookup per topic

```javascript
const AI_KEYWORDS = /\b(artificial intelligence|machine learning|neural net|deep learning|LLM|GPT|Claude|OpenAI|Anthropic|Gemini|Llama|Mistral|transformer|fine.?tun|RLHF|diffusion model|stable diffusion|midjourney|DALL-E|copilot|AI agent)\b/i;

const OPENCLAW_KEYWORDS = /\b(OpenClaw|Clawdbot|Clawdbot|lobstream|open.?claw)\b/i;

function keywordClassify(text) {
  const topics = [];
  if (OPENCLAW_KEYWORDS.test(text)) topics.push('openclaw');
  if (AI_KEYWORDS.test(text)) topics.push('ai');
  // ... more topic patterns
  return topics.length ? { topics, confidence: 0.8, tier: 1 } : null;
}
```

#### Tier 2: Embedding Similarity
- **Cost**: ~$0.01-0.05 per 1,000 posts (Voyage AI lite) or $0 (local model)
- **Latency**: 5-20ms per post (batched)
- **Accuracy**: Good for topic similarity, catches posts that use different words for the same concepts
- **Options**:
  - **Voyage AI** (`voyage-3-lite`): $0.02/1M tokens, fast, high quality
  - **Cohere** (`embed-english-light-v3.0`): free trial, $0.10/1M tokens
  - **Local**: Run `all-MiniLM-L6-v2` on the relay server (free, ~50MB model, 5ms/post)

Pre-compute centroid embeddings for each topic by averaging embeddings of ~50-100 representative texts. Store these as constants. At runtime, compute each post's embedding and find the nearest centroid.

#### Tier 3: LLM Classification
- **Cost**: ~$0.02 per 1,000 posts with Claude Haiku (batched)
- **Latency**: 200-500ms per batch
- **Accuracy**: Highest — understands sarcasm, context, indirect references
- **When to use**: Only for posts that Tier 1 and Tier 2 can't confidently classify, OR for periodic spot-checks to improve keyword/embedding accuracy

```javascript
// Batch prompt
const prompt = `Classify each post into one or more topics.
Topics: ai, politics, crypto, entertainment, science, openclaw, tech, culture, other

Posts:
1. "${post1}"
2. "${post2}"
...

Reply as JSON: [{"id": 1, "topics": ["ai", "tech"]}, ...]`;
```

### Cost Projections for AI Classification

Assuming ~500 messages/minute across all sources:

| Tier | Posts/min | Cost/month | Notes |
|------|-----------|------------|-------|
| Tier 1 (keywords) | ~500 (all) | $0 | Catches ~20-30% of topical posts |
| Tier 2 (embeddings) | ~350 (unmatched) | $0-5 | Local model = free; Voyage AI = ~$3/mo |
| Tier 3 (LLM) | ~50 (ambiguous) | $1-3 | Haiku batched, only for tough cases |
| **Total** | | **$0-8/mo** | |

### Frontend Integration

The SSE event format gains a `topics` field:

```
event: post
data: {"source":"mastodon","text":"Claude 4 just dropped...","topics":["ai"],"confidence":0.92,"ts":1707350400123}
```

The browser client can filter:

```javascript
// Show only AI-related posts
const backendStream = new BackendStream(addDrop, {
  sources: ['mastodon', 'reddit', '4chan'],
  topics: ['ai', 'openclaw']  // Only show posts tagged with these topics
});
```

Or the `/api/stream` endpoint accepts a `topics` filter:

```
GET /api/stream?topics=ai,openclaw
```

### UI Possibilities

- **Default mode**: Show everything (the raw stream)
- **Clawdbot mode**: Only AI/OpenClaw content — Clawdbot is "watching" for relevant content
- **Topic bubbles**: Small floating indicators showing what topics are trending in the stream
- **Heatmap**: The lobster glows brighter when more AI content flows through

### Phased AI Rollout

1. **Phase 1** (with initial backend): Keyword matching only. Free, instant, good enough for obvious matches.
2. **Phase 2**: Add embedding similarity. Catches more nuanced references. Use local model to keep cost at $0.
3. **Phase 3**: Add LLM tier for ambiguous posts. Enables high-accuracy topic tagging.
4. **Phase 4**: Fine-tune based on collected data. Build custom classifier from LLM-labeled training data.

---

## Open Questions

1. **Source filtering**: Should the browser client choose which backend sources to subscribe to, or should we stream everything and let the rain engine sample? Leaning toward: stream everything, sample randomly for visual balance.

2. **Rate balancing**: If Reddit produces 100 msgs/min and Rumble produces 5, how do we balance? Options: weighted random sampling in the relay, or in the browser. Leaning toward: relay-side weighted sampling before writing to Redis.

3. **Content filtering**: Should the relay filter out obvious spam, slurs, or NSFW content? For an art project showing "the internet talking," unfiltered is more authentic. But some sources (4chan) produce content that could be problematic to display. Leaning toward: no filtering initially, add optional filter later.

4. **Vercel Hobby SSE limits**: The 25-second streaming timeout on Edge Functions (Hobby plan) means the browser reconnects every 25 seconds. `EventSource` handles this transparently, but there is a brief gap. Is this acceptable? Almost certainly yes for an art project.

5. **Redis vs direct HTTP**: Could the relay just expose an HTTP endpoint that Vercel's SSE function polls? This eliminates the Redis dependency. Downside: relay becomes a single point of failure with no message buffer during SSE reconnections. Redis is better for reliability but adds a dependency.

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend platform for relay | Railway or Fly.io | Git-push deploys, $5/mo or free, no sysadmin |
| Message broker | Upstash Redis Streams | Serverless-compatible, free tier, purpose-built for streaming |
| Client protocol | SSE (Server-Sent Events) | Browser-native (`EventSource`), unidirectional (we only need server-to-client), auto-reconnect, works through Vercel Edge |
| Skip Twitter/X | Yes | $5,000/mo is absurd for an art project |
| First backend sources | Mastodon + 4chan | Easiest to implement, maximum political diversity gain, tests both WebSocket and polling patterns |
| Content filtering | None initially | Authenticity matters for an art project showing the raw internet |
