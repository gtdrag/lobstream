# Global Real-Time Social Media & Public Communication Data Streams
## Comprehensive Audit - February 2026

---

## TIER 1: Browser WebSocket / SSE, No Auth Required
*The gold standard for Lobstream-style apps*

---

### 1. Bluesky / AT Protocol (Jetstream)
- **Political leaning**: Center-left / tech-forward
- **Real-time streaming?**: YES - WebSocket firehose
- **Auth required**: NONE
- **Browser client-side?**: YES
- **Protocol**: `wss://jetstream2.us-east.bsky.network/subscribe` - JSON over WebSocket. Filter by collection (posts, likes, follows, etc.). 4 official public instances. No auth, no API key, no signup. ~40 lines of browser JS to consume.
- **Volume**: Millions of events/day
- **Lobstream status**: CURRENTLY IN USE

### 2. Nostr Protocol (Public Relays)
- **Political leaning**: Libertarian / right-leaning / crypto-aligned / global
- **Real-time streaming?**: YES - WebSocket native protocol
- **Auth required**: NONE for reading (pubkey needed for writing)
- **Browser client-side?**: YES
- **Protocol**: Connect to any relay via `wss://` (e.g., `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.nostr.band`, `wss://eden.nostr.land`). Send REQ with filters, receive EVENT messages as JSON. NIP-01 protocol. Hundreds of public relays available.
- **Volume**: Varies by relay; aggregate is substantial
- **Note**: Most relays accept anonymous read subscriptions. Some require NIP-42 auth. Browser-native via nostr-tools library or raw WebSocket.

### 3. Wikipedia / Wikimedia EventStreams
- **Political leaning**: Neutral / encyclopedic
- **Real-time streaming?**: YES - Server-Sent Events (SSE)
- **Auth required**: NONE
- **Browser client-side?**: YES
- **Protocol**: `https://stream.wikimedia.org/v2/stream/recentchange` - SSE format. Uses browser-native `EventSource` API. JSON payloads for every edit across all Wikimedia projects. Supports timestamp-based replay.
- **Volume**: ~5-10 edits/second across all wikis
- **Note**: One of the cleanest public SSE streams in existence.

### 4. Hacker News (Firebase Real-time)
- **Political leaning**: Tech-libertarian / center
- **Real-time streaming?**: YES - Firebase WebSocket (change notifications)
- **Auth required**: NONE
- **Browser client-side?**: YES
- **Protocol**: `https://hacker-news.firebaseio.com/v0/` - Firebase SDK or REST + SSE. Subscribe to `/v0/newstories`, `/v0/topstories`, individual items. Firebase sends change notifications ~every 30 seconds via WebSocket under the hood.
- **Volume**: Moderate (~1000 stories/day, ~10k comments/day)
- **Note**: Firebase SDK works natively in browser. Updates are near-real-time (30s delay).

### 5. IRC Networks (via WebSocket)
- **Political leaning**: Varies by network/channel - all spectrum
- **Real-time streaming?**: YES - WebSocket (RFC 7395 for XMPP; native IRC-over-WS on some servers)
- **Auth required**: NONE for many channels (nick registration optional)
- **Browser client-side?**: YES
- **Protocol**: `wss://` connections to IRC servers that support WebSocket (Libera Chat via KiwiIRC gateway, SwiftIRC, UnrealIRCd 5+). Standard IRC protocol over WebSocket. Join any public channel.
- **Volume**: Varies enormously by channel
- **Note**: Libera Chat is the largest network post-Freenode. Most require a gateway like KiwiIRC for browser access. Some servers expose direct WebSocket endpoints.

### 6. Bilibili Live Danmaku (Chat Bullets)
- **Political leaning**: Neutral / Chinese mainstream
- **Real-time streaming?**: YES - WebSocket
- **Auth required**: NONE for reading public rooms
- **Browser client-side?**: YES (with caveats)
- **Protocol**: `wss://` connection to Bilibili chat servers. Binary packet protocol (16-byte header, big-endian). Get server address via `api.live.bilibili.com/room/v1/Danmu/getConf`. Must send auth packet within 5s and heartbeat every 30s. JSON payloads after decompression.
- **Volume**: Enormous during popular streams (thousands/second)
- **Note**: npm package `bilibili-danmaku-client` works in browser. Requires understanding of binary protocol. Some rooms may require cookies for auth.

---

## TIER 2: Browser-Possible With Auth (API Key, OAuth, or App Token)
*Can work in browser but needs some form of credential*

---

### 7. Mastodon / ActivityPub Instances
- **Political leaning**: Left-leaning / progressive (varies by instance)
- **Real-time streaming?**: YES - WebSocket and SSE
- **Auth required**: YES - OAuth token required since v4.2.0 (2023)
- **Browser client-side?**: YES (with token)
- **Protocol**: `wss://{instance}/api/v1/streaming?access_token={token}&stream=public` or SSE via `GET /api/v1/streaming/public`. JSON events for statuses, notifications, etc.
- **Volume**: mastodon.social alone has millions of users
- **Major instances**: mastodon.social, hachyderm.io, fosstodon.org, infosec.exchange, mstdn.social, mastodon.online
- **Note**: Creating an app + getting a token is free and automated via API. Token can be embedded client-side (read-only app tokens are low-risk). Works for ANY Mastodon/Pleroma/Akkoma instance.

### 8. Pleroma / Akkoma Instances
- **Political leaning**: Varies (some far-right, some tech-neutral, some left)
- **Real-time streaming?**: YES - Mastodon-compatible streaming API
- **Auth required**: YES - OAuth token (same as Mastodon)
- **Browser client-side?**: YES (with token)
- **Protocol**: Same as Mastodon streaming API. Compatible endpoints.
- **Note**: Pleroma instances often have more permissive content policies. Notable instances: shitposter.club, poa.st, etc.

### 9. Misskey / Firefish / Sharkey Instances
- **Political leaning**: Neutral / Japanese-origin / global fediverse
- **Real-time streaming?**: YES - WebSocket with channel-based subscriptions
- **Auth required**: YES - API token
- **Browser client-side?**: YES (with token)
- **Protocol**: `wss://{instance}/streaming?i={token}` - JSON. Join channels like `globalTimeline`, `localTimeline`, `hybridTimeline`. Multiplexed on single connection. Rich event types.
- **Volume**: misskey.io is one of the largest fediverse instances
- **Note**: API token generation is free. Misskey's streaming is more sophisticated than Mastodon's.

### 10. Truth Social
- **Political leaning**: Far-right / Trump-aligned / conservative
- **Real-time streaming?**: PARTIAL - Mastodon-based streaming API may exist
- **Auth required**: YES - OAuth (Mastodon-compatible)
- **Browser client-side?**: MAYBE (if streaming endpoint is accessible)
- **Protocol**: Mastodon-fork API. Some endpoints restricted. As of Aug 2025, only prominent users' public profiles viewable without auth; most content requires authentication.
- **Volume**: Unknown (millions of users claimed)
- **Note**: Based on Mastodon but heavily modified. API access is inconsistent and may be restricted. Third-party tools like truthbrush (Stanford) have reverse-engineered access.

### 11. Gab
- **Political leaning**: Far-right / alt-right
- **Real-time streaming?**: PARTIAL - Was Mastodon fork, streaming API may still work
- **Auth required**: YES - OAuth (Mastodon-compatible historically)
- **Browser client-side?**: MAYBE
- **Protocol**: Originally Mastodon API. Has diverged significantly. May still support `wss://` streaming endpoints with proper auth. Defederated from Fediverse.
- **Note**: API documentation follows Mastodon docs. Actual availability uncertain. Service key required.

### 12. Twitch (EventSub WebSocket)
- **Political leaning**: Neutral / gaming / entertainment
- **Real-time streaming?**: YES - EventSub over WebSocket
- **Auth required**: YES - User Access Token (OAuth)
- **Browser client-side?**: YES (with OAuth token)
- **Protocol**: `wss://eventsub.wss.twitch.tv/ws` - JSON events. Must subscribe to event types via API. Covers chat messages, follows, subs, raids, etc. Replaces deprecated IRC chat and PubSub.
- **Volume**: Massive (millions of concurrent viewers, enormous chat volume)
- **Note**: Can receive events in browser after subscription setup. Subscription requires API call but can be done client-side with token.

### 13. Twitch IRC (Legacy but functional)
- **Political leaning**: Same as above
- **Real-time streaming?**: YES - IRC over WebSocket
- **Auth required**: YES - OAuth token
- **Browser client-side?**: YES (with token)
- **Protocol**: `wss://irc-ws.chat.twitch.tv:443` - IRC protocol over WebSocket. As of Aug 2025, non-SSL connections rejected. Being deprecated in favor of EventSub.
- **Volume**: Same as above
- **Note**: Requires secure WebSocket only. Migration to EventSub recommended.

### 14. Matrix Protocol (Public Rooms)
- **Political leaning**: Neutral / privacy-focused / tech
- **Real-time streaming?**: YES - Long-polling sync or WebSocket (experimental)
- **Auth required**: YES - Access token (guest or registered)
- **Browser client-side?**: YES (with matrix-js-sdk)
- **Protocol**: Client-Server API with `/sync` endpoint (long-polling). Join public rooms and receive timeline events. JSON payloads. `matrix-js-sdk` works in browser via bundler.
- **Volume**: Thousands of active public rooms
- **Homeservers**: matrix.org, gitter.im (bridged), mozilla.org, kde.org
- **Note**: Some homeservers allow guest access (no registration needed). Full browser SDK available.

### 15. Kick.com (Chat via Pusher WebSocket)
- **Political leaning**: Right-leaning / free speech / anti-Twitch
- **Real-time streaming?**: YES - Pusher-based WebSocket (reverse-engineered)
- **Auth required**: PARTIAL - Some access without auth via Pusher channels
- **Browser client-side?**: YES (via Pusher client)
- **Protocol**: Pusher WebSocket protocol. Connect to Pusher channel for specific stream's chat. Community libraries: kickpython, KickLib (C#), kick-rust. Official API uses webhooks, not WebSocket.
- **Volume**: Growing rapidly (millions of viewers)
- **Note**: Official API doesn't expose WebSocket; community has reverse-engineered Pusher channels. Browser-compatible via Pusher JS client.

### 16. VK (VKontakte) Streaming API
- **Political leaning**: Neutral (Russian mainstream) / state-aligned
- **Real-time streaming?**: YES - WebSocket-based Streaming API
- **Auth required**: YES - Service token from VK app
- **Browser client-side?**: YES (with service token)
- **Protocol**: WebSocket. Create rules with keywords, receive matching public posts. Limited to 1% of all public data. JSON payloads. Extended access requires VK support contact.
- **Volume**: Huge (most popular social network in Russia, ~100M+ users)
- **Note**: Requires VK developer app creation (free). 1% sample limitation on standard access.

### 17. XMPP Public MUC Rooms (via WebSocket)
- **Political leaning**: Neutral / privacy-focused / technical
- **Real-time streaming?**: YES - WebSocket (RFC 7395)
- **Auth required**: YES - Account on XMPP server (often free registration)
- **Browser client-side?**: YES (via Converse.js, Stanza.js, etc.)
- **Protocol**: XMPP over WebSocket. Join public Multi-User Chat rooms. XML stanzas. Libraries like Converse.js and Stanza.js handle browser-side.
- **Volume**: Varies by server and room
- **Note**: Many XMPP servers allow anonymous login or easy free registration. ejabberd, Prosody, etc.

### 18. Slack (Socket Mode / Legacy RTM)
- **Political leaning**: Neutral / corporate / tech
- **Real-time streaming?**: YES - WebSocket (Socket Mode for modern apps; legacy RTM deprecated)
- **Auth required**: YES - Bot token + Socket Mode
- **Browser client-side?**: NO (Socket Mode requires server-side; RTM deprecated)
- **Protocol**: WebSocket via `apps.connections.open`. JSON events. Legacy RTM was `wss://` direct connection but only for classic apps.
- **Volume**: Enormous (millions of workspaces)
- **Note**: Public Slack communities exist but Socket Mode requires server. Effectively Tier 3 for new apps.

### 19. Zulip (Real-time Events)
- **Political leaning**: Neutral / open source / academic
- **Real-time streaming?**: YES - Long-polling (not WebSocket)
- **Auth required**: YES - API key or user credentials
- **Browser client-side?**: YES (long-polling works from browser)
- **Protocol**: Register event queue via `POST /api/v1/register`, then long-poll `GET /api/v1/events`. JSON events. No WebSocket (uses HTTP long-polling intentionally for compatibility).
- **Volume**: Moderate (popular in open-source communities)
- **Note**: Several public Zulip instances (Rust, Lean, etc.). Open source.

### 20. CoinGecko Crypto WebSocket
- **Political leaning**: Neutral / crypto-finance
- **Real-time streaming?**: YES - WebSocket
- **Auth required**: YES - Paid plan (Analyst tier+)
- **Browser client-side?**: YES (with API key)
- **Protocol**: WebSocket streaming for real-time OHLCV, prices, trades. JSON. Ping/pong every 10s. 18,000+ coins, 1,700+ exchanges.
- **Volume**: Very high frequency
- **Note**: Not free. Paid plan required. Browser-compatible.

### 21. Farcaster (via Hubble)
- **Political leaning**: Crypto-centrist / Web3 / tech-forward
- **Real-time streaming?**: YES - gRPC / HTTP (Hubble node)
- **Auth required**: YES - Hubble node access (free if you run one, or use public hubs)
- **Browser client-side?**: PARTIAL - `@farcaster/hub-web` package for browser, but limited
- **Protocol**: gRPC on port 2283 (primary) or HTTP REST. Events API for real-time. Run your own Hubble node or use free endpoints (neynar.com, etc.). JSON/Protobuf.
- **Volume**: Growing (hundreds of thousands of users)
- **Note**: Most practical via third-party APIs like Neynar. `hub-web` package designed for browser but gRPC-web has limitations.

---

## TIER 3: Needs Backend Server
*Has some form of API but can't work purely client-side in browser*

---

### 22. Twitter / X
- **Political leaning**: Center-right (post-Musk) / global
- **Real-time streaming?**: YES - Filtered Stream, Sampled Stream (v2 API)
- **Auth required**: YES - Pro tier $5,000/month minimum for streaming
- **Browser client-side?**: NO (CORS blocked, auth tokens can't be exposed)
- **Protocol**: Server-sent connection via HTTP streaming. JSON-lines. Filtered stream allows rule-based filtering. Free tier is write-only (no reading). Basic $200/mo allows reading but no streaming.
- **Volume**: 500M+ tweets/day
- **Note**: Streaming only available on Pro tier ($5k/mo) or Enterprise. The most expensive public streaming API in social media.

### 23. Reddit
- **Political leaning**: Center-left (varies by subreddit)
- **Real-time streaming?**: LIMITED - No native streaming API. Pushshift SSE was available but shut down after 2023 API changes.
- **Auth required**: YES - OAuth + API key (free tier available)
- **Browser client-side?**: NO (CORS blocked)
- **Protocol**: REST API only (PRAW for Python). Poll `/new.json` endpoints. Rate-limited to 60 req/min with OAuth, 10/min without. No WebSocket or SSE.
- **Volume**: Enormous
- **Note**: Pushshift's SSE stream (`stream.pushshift.io`) is no longer functioning for real-time data. Reddit killed third-party streaming in 2023.

### 24. YouTube Live Chat
- **Political leaning**: Neutral / mainstream / global
- **Real-time streaming?**: PARTIAL - Polling API, no native WebSocket
- **Auth required**: YES - OAuth + API key (quota-limited)
- **Browser client-side?**: NO (API key exposure concern, CORS issues)
- **Protocol**: REST API (`liveChatMessages.list`). Poll for new messages. Quota system limits volume. Google also has gRPC server-streaming but requires OAuth.
- **Volume**: Massive during popular streams
- **Note**: Community projects like `Youtube-WS-Chat-Wrapper` create WebSocket wrappers but require backend.

### 25. Telegram (Bot API / MTProto)
- **Political leaning**: Neutral / privacy-focused / popular with all political extremes globally
- **Real-time streaming?**: YES - Long-polling via Bot API; MTProto for client API
- **Auth required**: YES - Bot token or MTProto auth
- **Browser client-side?**: NO (MTProto too complex for browser; Bot API needs backend)
- **Protocol**: Bot API: `getUpdates` long-polling or webhooks. MTProto: binary protocol, TCP-based. Libraries: Telethon (Python), GramJS (JS, supports browser but complex).
- **Volume**: Enormous (900M+ users, millions of public channels)
- **Note**: Public channels are readable via MTProto with proper auth. GramJS technically works in browser but requires phone number auth flow.

### 26. Discord (Gateway)
- **Political leaning**: Neutral / gaming / communities across spectrum
- **Real-time streaming?**: YES - WebSocket Gateway
- **Auth required**: YES - Bot token or user token (ToS violation for user tokens)
- **Browser client-side?**: NO (Discord explicitly blocks non-official browser clients; requires bot token)
- **Protocol**: `wss://gateway.discord.gg` - JSON or ETF encoding. OP codes for handshake, heartbeat, dispatch. Rich event system for messages, reactions, presence.
- **Volume**: Massive (200M+ MAU)
- **Note**: Bot must be invited to server. No anonymous access. Self-botting (user tokens) violates ToS.

### 27. Rumble (Live Stream API)
- **Political leaning**: Right-leaning / conservative / free speech
- **Real-time streaming?**: PARTIAL - REST API for live stream data
- **Auth required**: YES - API key (free for creators)
- **Browser client-side?**: NO (API key exposure)
- **Protocol**: REST endpoints for live stream metadata, chat messages (last 50), rants. No WebSocket. Poll-based. v1.1 API.
- **Volume**: Growing (popular with conservative creators)
- **Note**: API designed for OBS overlays, not general consumption. Limited to active livestreams.

### 28. StockTwits (Firestream)
- **Political leaning**: Neutral / retail finance / trading
- **Real-time streaming?**: YES - Firestream persistent connection
- **Auth required**: YES - API key / paid plan
- **Browser client-side?**: NO (requires backend)
- **Protocol**: Firestream endpoint for real-time social sentiment data. JSON. Supports symbol-specific streams. NLP-processed sentiment included.
- **Volume**: 10M+ users, very active during market hours
- **Note**: Standard API is REST with rate limits. Firestream is premium feature.

### 29. Lemmy Instances
- **Political leaning**: Left-leaning (mostly) / varies by instance
- **Real-time streaming?**: PARTIAL - WebSocket support was added then removed in recent versions
- **Auth required**: YES - JWT token
- **Browser client-side?**: NO (WebSocket was removed; now HTTP API only)
- **Protocol**: `lemmy-js-client` supports HTTP. WebSocket was available in earlier versions but deprecated in v0.19+. REST API only now.
- **Volume**: lemmy.ml, lemmy.world, etc. - moderate
- **Note**: WebSocket support was removed. Now REST-only with polling.

### 30. 4chan
- **Political leaning**: Far-right to centrist / anonymous / provocative
- **Real-time streaming?**: NO - REST API only
- **Auth required**: NONE (but CORS-blocked for browser)
- **Browser client-side?**: NO (CORS blocked)
- **Protocol**: JSON REST API. `a.4cdn.org/boards.json`, `a.4cdn.org/{board}/threads.json`, `a.4cdn.org/{board}/thread/{no}.json`. Rate limit: 1 req/sec per endpoint. No auth needed but CORS prevents browser use.
- **Volume**: High (one of the most active forums)
- **Note**: API is public and free but requires backend proxy due to CORS. Community projects (fountain, hurr-durr) build streaming wrappers server-side.

### 31. Facebook / Meta
- **Political leaning**: Neutral / mainstream / global
- **Real-time streaming?**: NO (for public) / Webhooks for apps
- **Auth required**: YES - OAuth + app approval
- **Browser client-side?**: NO
- **Protocol**: Graph API (REST). Real-time updates only via webhooks for page events. Meta Content Library (academic access only) provides near-real-time search. No public streaming.
- **Volume**: 3B+ users
- **Note**: Most locked-down of major platforms. No public streaming API exists.

### 32. Instagram
- **Political leaning**: Neutral / mainstream
- **Real-time streaming?**: NO
- **Auth required**: YES - Business/Creator account + OAuth
- **Browser client-side?**: NO
- **Protocol**: Instagram Graph API (REST). Business accounts only. No public timeline access. Webhooks for mentions/comments on your content only.
- **Volume**: 2B+ users
- **Note**: No streaming capability at all for third parties.

### 33. Threads (Meta)
- **Political leaning**: Center-left / mainstream
- **Real-time streaming?**: NO - REST API + Webhooks (July 2025 expansion)
- **Auth required**: YES - OAuth
- **Browser client-side?**: NO
- **Protocol**: Threads API (REST). As of July 2025, supports webhooks for mentions/replies. Publishing API available. No streaming endpoint.
- **Volume**: 200M+ users
- **Note**: Newest Meta platform. API expanding but no firehose or streaming.

### 34. TikTok
- **Political leaning**: Neutral / youth / global
- **Real-time streaming?**: NO
- **Auth required**: YES - Strict developer approval process
- **Browser client-side?**: NO
- **Protocol**: REST API. Research API for academics. Very restrictive. No streaming. Rate-limited.
- **Volume**: 1B+ users
- **Note**: API approval is difficult and slow. No real-time capabilities for third parties.

### 35. LinkedIn
- **Political leaning**: Center / professional / corporate
- **Real-time streaming?**: NO
- **Auth required**: YES - OAuth + partner approval
- **Browser client-side?**: NO
- **Protocol**: REST API. Very restricted. Most endpoints require Marketing Developer Platform or Community Management API approval. No streaming.
- **Volume**: 1B+ users
- **Note**: One of the most restrictive APIs. No streaming at all.

### 36. Pinterest
- **Political leaning**: Neutral / lifestyle
- **Real-time streaming?**: NO
- **Auth required**: YES - OAuth
- **Browser client-side?**: NO
- **Protocol**: REST API. Pin/board management. No public feed access. No streaming.
- **Volume**: 500M+ users
- **Note**: API is business-focused. No streaming capability.

### 37. Snapchat
- **Political leaning**: Neutral / youth
- **Real-time streaming?**: NO
- **Auth required**: YES - Developer approval
- **Browser client-side?**: NO
- **Protocol**: Snap Kit SDKs. Marketing API. No public content API. No streaming.
- **Volume**: 800M+ users
- **Note**: Entirely closed ecosystem. No third-party streaming.

### 38. Weibo (Sina Weibo)
- **Political leaning**: Neutral (Chinese mainstream) / state-supervised
- **Real-time streaming?**: NO native streaming API
- **Auth required**: YES - App key + secret
- **Browser client-side?**: NO
- **Protocol**: REST API. Public timeline returns ~50 posts per page. No WebSocket or SSE. Search endpoints available. 100M+ new posts/day.
- **Volume**: Enormous (600M+ users)
- **Note**: No free streaming API comparable to Twitter's old firehose. Requires Chinese developer account.

### 39. Douyin (Chinese TikTok)
- **Political leaning**: Neutral (Chinese mainstream)
- **Real-time streaming?**: NO public API
- **Auth required**: YES - Chinese business verification
- **Browser client-side?**: NO
- **Protocol**: Closed API. Available only to approved Chinese businesses. No public developer access for non-Chinese entities.
- **Volume**: 750M+ DAU
- **Note**: Completely closed to international developers.

### 40. Nico Nico Douga (Niconico)
- **Political leaning**: Neutral / Japanese mainstream / otaku
- **Real-time streaming?**: PARTIAL - Live chat WebSocket exists
- **Auth required**: YES - Account login
- **Browser client-side?**: NO (requires session cookies)
- **Protocol**: WebSocket for live stream comments. REST API for video metadata. Requires authenticated session.
- **Volume**: Moderate (Japanese market)
- **Note**: Server migration ongoing as of 2025. Community tools like yt-dlp support it.

### 41. Naver (Korea)
- **Political leaning**: Neutral / Korean mainstream
- **Real-time streaming?**: NO public streaming API
- **Auth required**: YES - Developer registration
- **Browser client-side?**: NO
- **Protocol**: REST APIs for search, maps, etc. No social feed streaming.
- **Volume**: Dominant in Korea
- **Note**: Naver Cafe and Blog APIs exist but no real-time streaming.

### 42. LINE
- **Political leaning**: Neutral / Japanese-SE Asian mainstream
- **Real-time streaming?**: YES - Messaging API webhooks
- **Auth required**: YES - Channel token
- **Browser client-side?**: NO (webhook-based, needs server)
- **Protocol**: Webhook for incoming messages. REST for sending. No WebSocket for receiving.
- **Volume**: 194M+ MAU
- **Note**: No client-side streaming possible. Designed for chatbot backends.

### 43. KakaoTalk
- **Political leaning**: Neutral / Korean mainstream
- **Real-time streaming?**: NO public streaming
- **Auth required**: YES - Developer registration
- **Browser client-side?**: NO
- **Protocol**: REST APIs. Kakao SDK. No public message streaming.
- **Volume**: 47M+ MAU (97% of South Korea)
- **Note**: Closed messaging platform. No third-party streaming.

### 44. DeSo (Decentralized Social)
- **Political leaning**: Crypto-libertarian / Web3
- **Real-time streaming?**: YES - Node sync provides real-time updates
- **Auth required**: YES - Node access (run your own or use public node)
- **Browser client-side?**: NO (requires node connection)
- **Protocol**: Blockchain node API. REST endpoints on public nodes. Real-time via node sync. "Open firehose" of all data if you run a node.
- **Volume**: Small but active crypto community
- **Note**: Can access data from public nodes but no browser-friendly WebSocket stream.

### 45. Lens Protocol
- **Political leaning**: Crypto / Web3 / neutral
- **Real-time streaming?**: NO dedicated streaming API
- **Auth required**: YES - API key for some endpoints
- **Browser client-side?**: NO
- **Protocol**: GraphQL API. Blockchain-based (Polygon). No WebSocket or SSE for real-time posts. Query-based access to profiles and publications.
- **Volume**: Small but well-funded
- **Note**: No real-time streaming. REST/GraphQL only.

### 46. Minds
- **Political leaning**: Libertarian / free speech / crypto-incentivized
- **Real-time streaming?**: NO known streaming API
- **Auth required**: YES - API token
- **Browser client-side?**: NO
- **Protocol**: REST API. Open source (code on GitLab). Documentation at developers.minds.com. No documented streaming endpoints.
- **Volume**: Moderate
- **Note**: Open source platform. Could theoretically be extended but no built-in streaming.

### 47. GETTR
- **Political leaning**: Far-right / conservative / Trump-adjacent
- **Real-time streaming?**: NO
- **Auth required**: NONE for some endpoints (undocumented API)
- **Browser client-side?**: NO (CORS likely blocked)
- **Protocol**: Undocumented REST API. Third-party tools: GoGettr (Python), gettr-api-js (TypeScript). Can pull posts, trends, livestreams via polling. No WebSocket or streaming.
- **Volume**: Moderate (declining)
- **Note**: API is open but undocumented. No streaming. Polling only.

### 48. Odysee / LBRY
- **Political leaning**: Libertarian / free speech / crypto
- **Real-time streaming?**: PARTIAL - Odysee Chatter for live chat
- **Auth required**: YES
- **Browser client-side?**: NO
- **Protocol**: REST API (bridge between web and LBRY blockchain). Odysee Chatter bot has its own API. LBRY protocol is blockchain-based.
- **Volume**: Moderate
- **Note**: LBRY Inc. ceased operations. Odysee continues under new ownership post-2024.

### 49. Medium
- **Political leaning**: Center-left / liberal
- **Real-time streaming?**: NO
- **Auth required**: N/A - Official API shut down
- **Browser client-side?**: NO
- **Protocol**: API was discontinued. RSS feeds still work. No programmatic access for new content in real-time.
- **Volume**: Huge (100M+ monthly readers)
- **Note**: No API available. RSS only.

### 50. Substack
- **Political leaning**: Varies widely (all political spectrum)
- **Real-time streaming?**: NO
- **Auth required**: N/A - No public API
- **Browser client-side?**: NO
- **Protocol**: No public API. RSS feeds for individual publications. No streaming.
- **Volume**: Large (35M+ subscribers across platform)
- **Note**: No developer API exists.

### 51. Ghost
- **Political leaning**: Neutral / independent publishing
- **Real-time streaming?**: NO
- **Auth required**: YES - Content API key
- **Browser client-side?**: YES (Content API is CORS-enabled for configured domains)
- **Protocol**: REST API (Content API for reading, Admin API for writing). JSON. No streaming or webhooks for new posts.
- **Volume**: Varies by instance
- **Note**: Self-hosted instances can expose Content API client-side. But no streaming.

### 52. Hashnode
- **Political leaning**: Neutral / developer community
- **Real-time streaming?**: NO
- **Auth required**: YES - API token for some operations
- **Browser client-side?**: NO
- **Protocol**: GraphQL API. No streaming. Query-based.
- **Volume**: Moderate (developer niche)

### 53. dev.to (Forem)
- **Political leaning**: Center-left / progressive tech
- **Real-time streaming?**: NO
- **Auth required**: PARTIAL - API key for some endpoints; public endpoints exist
- **Browser client-side?**: PARTIAL (public REST endpoints work)
- **Protocol**: REST API. `/api/articles` returns public articles. No streaming. Polling only.
- **Volume**: Large dev community

### 54. Diaspora
- **Political leaning**: Left-leaning / privacy-focused
- **Real-time streaming?**: NO
- **Auth required**: YES - OAuth
- **Browser client-side?**: NO
- **Protocol**: REST API (JSON). Federation protocol for pod-to-pod communication. No streaming endpoints.
- **Volume**: Small but global

### 55. Scuttlebutt (SSB)
- **Political leaning**: Left-libertarian / off-grid / privacy
- **Real-time streaming?**: YES - P2P replication (real-time when peers online)
- **Auth required**: YES - Cryptographic identity
- **Browser client-side?**: NO (requires local SSB server/client)
- **Protocol**: Append-only log replication over TCP/UDP. Ed25519 signed messages. SHA256 hashed. Gossip protocol. Node.js reference implementation.
- **Volume**: Very small (thousands of users)
- **Note**: Fundamentally P2P - no central server to connect to from browser.

### 56. Strava
- **Political leaning**: Neutral / fitness
- **Real-time streaming?**: NO
- **Auth required**: YES - OAuth
- **Browser client-side?**: NO
- **Protocol**: REST API. Activity data. No streaming. Webhooks available for activity uploads (push to your server).
- **Volume**: 120M+ users

### 57. Goodreads
- **Political leaning**: Neutral / literary
- **Real-time streaming?**: NO
- **Auth required**: YES - API key (but API deprecated in 2020)
- **Browser client-side?**: NO
- **Protocol**: Legacy API (deprecated). RSS feeds still work for some data. Owned by Amazon.
- **Volume**: 150M+ users
- **Note**: API officially shut down December 2020.

### 58. Letterboxd
- **Political leaning**: Center-left / film
- **Real-time streaming?**: NO
- **Auth required**: YES - API key (by request only)
- **Browser client-side?**: NO
- **Protocol**: REST API (beta). HTTPS endpoints. JSON. Request access via api@letterboxd.com.
- **Volume**: 15M+ users (growing rapidly)

### 59. Last.fm
- **Political leaning**: Neutral / music
- **Real-time streaming?**: NO
- **Auth required**: YES - API key (free)
- **Browser client-side?**: YES (API key in URL, CORS allowed)
- **Protocol**: REST API. JSON/XML. Scrobble data, user listening history. `user.getRecentTracks` for near-real-time listening data. No streaming.
- **Volume**: Moderate (active scrobbling community)
- **Note**: Polling `getRecentTracks` gives near-real-time listening data. CORS headers present.

### 60. Untappd
- **Political leaning**: Neutral / beer/social
- **Real-time streaming?**: NO
- **Auth required**: YES - API key (approved access)
- **Browser client-side?**: NO
- **Protocol**: REST API. JSON. Check-in data, beer/brewery info.
- **Volume**: Small-moderate

### 61. Reuters / Thomson Reuters
- **Political leaning**: Center / mainstream news
- **Real-time streaming?**: YES - Real-time news streaming (enterprise)
- **Auth required**: YES - Enterprise subscription ($$$)
- **Browser client-side?**: NO
- **Protocol**: LSEG/Refinitiv Data Platform. REST + streaming. Proprietary protocols. Structured news in 16 languages.
- **Note**: Very expensive enterprise product. Not accessible to individual developers.

### 62. Associated Press (AP)
- **Political leaning**: Center / mainstream news
- **Real-time streaming?**: YES - AP Media API with streaming
- **Auth required**: YES - Enterprise subscription ($$$)
- **Browser client-side?**: NO
- **Protocol**: Proprietary media API. Structured news content. Enterprise pricing.
- **Note**: Requires commercial agreement with AP.

### 63. Agence France-Presse (AFP)
- **Political leaning**: Center / European mainstream
- **Real-time streaming?**: YES - News wire delivery
- **Auth required**: YES - Enterprise subscription ($$$)
- **Browser client-side?**: NO
- **Protocol**: Proprietary feed. IPTC standards. Enterprise only.

### 64. OpenSky Network (ADS-B)
- **Political leaning**: Neutral / aviation / research
- **Real-time streaming?**: PARTIAL - REST API with frequent updates
- **Auth required**: PARTIAL - Anonymous (limited) or registered (free, more data)
- **Browser client-side?**: NO (CORS unclear)
- **Protocol**: REST API. JSON. Aircraft state vectors updated every ~10 seconds. No WebSocket/SSE.
- **Volume**: Global aircraft tracking

### 65. Congress.gov / LegiScan / Open States
- **Political leaning**: Neutral / government transparency
- **Real-time streaming?**: NO (LegiScan updates every 4h standard, 15min premium)
- **Auth required**: YES - API key (free tier available)
- **Browser client-side?**: PARTIAL (some CORS-enabled endpoints)
- **Protocol**: REST API. JSON/XML. Bill data, votes, sponsors. Real Time Congress API exists but near-real-time, not streaming.
- **Volume**: Moderate (legislative session dependent)

### 66. DLive
- **Political leaning**: Libertarian / crypto-incentivized / some far-right
- **Real-time streaming?**: PARTIAL - Live chat likely via WebSocket (undocumented)
- **Auth required**: Unknown
- **Browser client-side?**: Unknown
- **Protocol**: Blockchain-based (Lino/BitTorrent). Undocumented API. Community bots exist.
- **Volume**: Small (declining)

### 67. Trovo
- **Political leaning**: Neutral / gaming (Tencent-owned)
- **Real-time streaming?**: PARTIAL - Chat API exists
- **Auth required**: YES - Developer registration
- **Browser client-side?**: NO
- **Protocol**: REST + WebSocket for chat. Developer program exists but limited documentation.
- **Volume**: Small-moderate

### 68. BitChute
- **Political leaning**: Far-right / conspiracy / free speech
- **Real-time streaming?**: NO
- **Auth required**: Unknown
- **Browser client-side?**: NO
- **Protocol**: No known public API. Video hosting platform. Some unofficial scraping tools.
- **Volume**: Moderate in niche

### 69. 8kun (formerly 8chan)
- **Political leaning**: Far-right / extremist / anonymous
- **Real-time streaming?**: NO
- **Auth required**: NONE
- **Browser client-side?**: NO
- **Protocol**: Imageboard with JSON API similar to 4chan. `8kun.top/{board}/catalog.json`. No streaming.
- **Volume**: Small (controversial)

### 70. Scored / communities.win
- **Political leaning**: Far-right / conservative / Trump-supporting
- **Real-time streaming?**: NO
- **Auth required**: Unknown
- **Browser client-side?**: NO
- **Protocol**: No known public API. Web scraping only.
- **Volume**: Moderate in niche (TheDonald.win community)

### 71. Poal
- **Political leaning**: Far-right / Voat successor
- **Real-time streaming?**: NO
- **Auth required**: Unknown
- **Browser client-side?**: NO
- **Protocol**: No known public API.
- **Volume**: Very small

### 72. Tildes
- **Political leaning**: Center-left / thoughtful discussion
- **Real-time streaming?**: NO
- **Auth required**: YES (invite-only platform)
- **Browser client-side?**: NO
- **Protocol**: No public API. Open source (Python/Pyramid). Invite-only community.
- **Volume**: Very small but high quality

### 73. Lobste.rs
- **Political leaning**: Center / tech
- **Real-time streaming?**: NO
- **Auth required**: YES (invite-only) for account; public JSON endpoints exist
- **Browser client-side?**: PARTIAL (`.json` suffix on URLs returns JSON)
- **Protocol**: Rails app. Append `.json` to any page URL. No streaming. Invite-only registration.
- **Volume**: Small

### 74. ShareChat (India)
- **Political leaning**: Neutral / Indian regional
- **Real-time streaming?**: NO known public API
- **Auth required**: Unknown
- **Browser client-side?**: NO
- **Protocol**: No documented public API.
- **Volume**: 400M+ users (Indian market)

### 75. Koo (India)
- **Political leaning**: Center-right / Indian nationalist
- **Real-time streaming?**: N/A - SHUT DOWN in 2024
- **Auth required**: N/A
- **Browser client-side?**: N/A
- **Protocol**: N/A - Platform ceased operations
- **Note**: Shut down in 2024 due to funding issues.

### 76. Parler
- **Political leaning**: Far-right / conservative
- **Real-time streaming?**: N/A - SHUT DOWN in April 2023
- **Auth required**: N/A
- **Browser client-side?**: N/A
- **Protocol**: N/A - Platform ceased operations
- **Note**: Acquired by Starboard and immediately shut down.

### 77. Cohost
- **Political leaning**: Left / progressive / queer
- **Real-time streaming?**: N/A - SHUT DOWN in late 2024
- **Auth required**: N/A
- **Browser client-side?**: N/A
- **Protocol**: N/A - Platform ceased operations
- **Note**: Went read-only October 2024, fully shut down by end of 2024.

### 78. Pillowfort
- **Political leaning**: Left / progressive / fandom
- **Real-time streaming?**: NO
- **Auth required**: YES
- **Browser client-side?**: NO
- **Protocol**: No public API. Crowdfunded platform struggling financially.
- **Volume**: Very small

### 79. MeWe
- **Political leaning**: Right-leaning / privacy-focused / Facebook alternative
- **Real-time streaming?**: NO
- **Auth required**: Unknown
- **Browser client-side?**: NO
- **Protocol**: No known public API. Closed platform.
- **Volume**: Moderate

### 80. CloutHub
- **Political leaning**: Right / conservative
- **Real-time streaming?**: NO
- **Auth required**: Unknown
- **Browser client-side?**: NO
- **Protocol**: No known public API.
- **Volume**: Very small

### 81. Frank Speech
- **Political leaning**: Far-right / Mike Lindell
- **Real-time streaming?**: NO
- **Auth required**: Unknown
- **Browser client-side?**: NO
- **Protocol**: No known public API. Video platform.
- **Volume**: Small

### 82. Caffeine (Streaming)
- **Political leaning**: Neutral / entertainment / gaming
- **Real-time streaming?**: PARTIAL - Live chat during streams
- **Auth required**: YES
- **Browser client-side?**: NO
- **Protocol**: Undocumented. Live streaming platform backed by 21st Century Fox.
- **Volume**: Small

### 83. WordPress.com (Automattic)
- **Political leaning**: Neutral / publishing
- **Real-time streaming?**: NO
- **Auth required**: YES - OAuth or API key
- **Browser client-side?**: PARTIAL (public REST API endpoints)
- **Protocol**: REST API v2. JSON. `/wp/v2/posts` for public sites. No streaming. Webhooks via Jetpack.
- **Volume**: Enormous (40%+ of all websites)
- **Note**: Self-hosted WordPress instances can expose REST API. No streaming.

### 84. Bluesky Firehose (AT Protocol native)
- **Political leaning**: Same as #1
- **Real-time streaming?**: YES - CBOR-encoded WebSocket
- **Auth required**: NONE
- **Browser client-side?**: DIFFICULT (CBOR binary format, high bandwidth)
- **Protocol**: `wss://bsky.network` - Full AT Protocol firehose. CAR file blocks, CBOR encoding. Much heavier than Jetstream. Requires CBOR parsing library.
- **Volume**: Everything on the AT Protocol network
- **Note**: Jetstream (#1) is the developer-friendly version of this. Raw firehose is for infrastructure operators.

---

## BONUS: Notable Non-Social Real-Time Public Streams

### 85. GitHub Events API
- **Real-time?**: NO (REST polling, ~5min delay)
- **Auth**: Optional API key for higher rate limit
- **Protocol**: REST. `/events` endpoint. JSON. Public repository events.

### 86. Blockchain Mempool Streams (Bitcoin, Ethereum)
- **Real-time?**: YES - WebSocket
- **Auth**: NONE for many public nodes
- **Browser?**: YES
- **Protocol**: `wss://` connections to public Ethereum/Bitcoin nodes. JSON-RPC subscriptions for pending transactions, new blocks. Services: mempool.space, Infura, Alchemy.

### 87. Earthquake/Seismic (USGS)
- **Real-time?**: YES - GeoJSON feed updated every minute
- **Auth**: NONE
- **Browser?**: YES (CORS enabled)
- **Protocol**: REST with very frequent updates. `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson`

### 88. National Weather Service (NWS)
- **Real-time?**: PARTIAL - Frequent polling
- **Auth**: NONE
- **Browser?**: YES
- **Protocol**: REST API. JSON-LD. `api.weather.gov`. CORS enabled.

### 89. AIS Marine Traffic (public receivers)
- **Real-time?**: YES - Various WebSocket feeds
- **Auth**: Varies
- **Browser?**: PARTIAL
- **Protocol**: AIS data streams from community receivers.

---

## SUMMARY STATISTICS

### Total Platforms/Sources Identified: 89

### By Streaming Capability:

| Category | Count |
|----------|-------|
| Has real-time streaming (WebSocket/SSE/long-poll) | 35 |
| REST API only (polling) | 30 |
| No public API at all | 18 |
| Shut down / defunct | 3 |
| Undocumented / uncertain | 3 |

### Browser Client-Side Capability (No Backend):

| Category | Count |
|----------|-------|
| YES - Works in browser, no auth | 6 |
| YES - Works in browser, with auth/token | 14 |
| NO - Requires backend | 66 |
| N/A (shut down) | 3 |

### Tier Distribution:

| Tier | Description | Count | Platforms |
|------|-------------|-------|-----------|
| **Tier 1** | Browser WebSocket/SSE, NO auth | **6** | Bluesky Jetstream, Nostr relays, Wikipedia EventStreams, Hacker News Firebase, IRC (WebSocket), Bilibili Danmaku |
| **Tier 2** | Browser-possible WITH auth | **14** | Mastodon, Pleroma, Misskey, Truth Social, Gab, Twitch EventSub, Twitch IRC, Matrix, Kick (Pusher), VK Streaming, XMPP, Zulip, CoinGecko WS, Farcaster |
| **Tier 3** | Needs backend server | **45** | Twitter/X, Reddit, YouTube, Telegram, Discord, Rumble, StockTwits, Lemmy, 4chan, Facebook, Instagram, Threads, TikTok, LinkedIn, Pinterest, Snapchat, Weibo, Douyin, Niconico, LINE, KakaoTalk, DeSo, Lens, Minds, GETTR, Odysee, Medium, Substack, Ghost, Hashnode, dev.to, Diaspora, Scuttlebutt, Strava, Letterboxd, Last.fm, Untappd, Reuters, AP, AFP, OpenSky, Congress, DLive, Trovo, WordPress, plus bonus streams |
| **Tier 4** | No streaming API at all | **21** | BitChute, 8kun, Scored, Poal, Tildes, Lobste.rs, ShareChat, Pillowfort, MeWe, CloutHub, Frank Speech, Caffeine, Naver, KakaoTalk, Goodreads, Snapchat, Pinterest, LinkedIn, TikTok (no streaming), Facebook (no streaming), Douyin |

*Note: Some platforms appear in both Tier 3 and Tier 4 because they have a REST API but zero streaming capability.*

---

## THE GOLD STANDARD: Tier 1 Deep Dive

These are the only sources in the world that match what Lobstream currently does with Bluesky:

| # | Source | Protocol | Auth | Volume | Political Spectrum |
|---|--------|----------|------|--------|-------------------|
| 1 | **Bluesky Jetstream** | WebSocket (JSON) | None | Millions/day | Center-left / tech |
| 2 | **Nostr Relays** | WebSocket (JSON) | None* | Varies | Libertarian / right |
| 3 | **Wikipedia EventStreams** | SSE (JSON) | None | ~5-10/sec | Neutral |
| 4 | **Hacker News Firebase** | WebSocket (JSON) | None | ~30s batches | Tech-libertarian |
| 5 | **IRC via WebSocket** | WebSocket (IRC) | None** | Varies | All spectrum |
| 6 | **Bilibili Danmaku** | WebSocket (binary) | None*** | Enormous | Chinese mainstream |

\* Nostr relays require no auth for reading; some relays may require NIP-42 auth.
\** IRC requires a nick but not registration on most networks; some WebSocket gateways add overhead.
\*** Bilibili technically requires auth packet but not user credentials; cookie may be needed for some rooms.

---

## ARCHITECTURAL RECOMMENDATION FOR LOBSTREAM

If you wanted to expand Lobstream to consume multiple real-time streams simultaneously in the browser with zero backend, your realistic options are:

1. **Bluesky Jetstream** (current) -- rock solid
2. **Nostr relays** -- excellent complement, covers right-leaning/crypto audience
3. **Wikipedia EventStreams** -- fascinating non-social data, SSE via native EventSource
4. **Hacker News** -- requires Firebase SDK but works client-side
5. **Mastodon instances** -- requires one-time token generation, then browser WebSocket works
6. **Misskey instances** -- same as Mastodon but richer streaming model

Everything else either needs a backend proxy, costs money, or simply doesn't offer streaming.

The true answer to "what's out there?" is sobering: **out of 89 identified platforms, only 6 offer the zero-auth browser WebSocket/SSE gold standard**, and one of those (Bilibili) uses a binary protocol that's nontrivial to consume.
