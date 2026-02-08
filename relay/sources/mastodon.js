// Mastodon source connector — connects to the public streaming API of multiple
// Mastodon instances via WebSocket and feeds normalised posts into Redis.

import WebSocket from 'ws';
import { addMessage } from '../lib/redis.js';
import { stripHtml } from '../lib/normalize.js';

// ── Configuration ───────────────────────────────────────────────────────────

const INSTANCES = [
  { host: 'mastodon.social' },   // largest general-purpose instance
  { host: 'hachyderm.io' },      // tech-focused
  { host: 'fosstodon.org' },     // FOSS / tech
  { host: 'mstdn.social' },     // general
  { host: 'mas.to' },           // general
];

const MIN_TEXT_LENGTH = 10;      // skip posts shorter than this after HTML strip

// ── Optional classifier (safe to import even if classify.js is absent) ──────

let classify = null;
try {
  const mod = await import('../lib/classify.js');
  classify = mod.classify;
} catch {
  // classify.js not available — topics will not be tagged
}

// ── Per-instance connection handler ─────────────────────────────────────────

class MastodonInstance {
  /**
   * @param {string} host  - Mastodon instance hostname (e.g. 'mastodon.social')
   * @param {string} [token] - Optional OAuth access token for authenticated streaming
   */
  constructor(host, token) {
    this.host = host;
    this.token = token || null;
    this.ws = null;
    this.running = false;
    this.reconnectDelay = 1000;        // starting backoff delay in ms
    this.maxReconnectDelay = 30000;    // ceiling for backoff
    this.reconnectTimer = null;
  }

  /** Start the connection loop for this instance. */
  start() {
    this.running = true;
    this._connect();
  }

  /** Cleanly stop — no further reconnection attempts. */
  stop() {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  _buildUrl() {
    const base = `wss://${this.host}/api/v1/streaming?stream=public`;
    if (this.token) {
      return `${base}&access_token=${this.token}`;
    }
    return base;
  }

  _connect() {
    if (!this.running) return;

    const url = this._buildUrl();
    console.log(`[mastodon][${this.host}] connecting to ${url}`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log(`[mastodon][${this.host}] connected`);
      // Reset backoff on successful connection
      this.reconnectDelay = 1000;
    });

    this.ws.on('message', (raw) => {
      this._handleMessage(raw);
    });

    this.ws.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : 'no reason';
      console.log(`[mastodon][${this.host}] disconnected (code=${code}, reason=${reasonStr})`);
      this._scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error(`[mastodon][${this.host}] error: ${err.message}`);
      // The 'close' event will fire after this, triggering reconnect
    });
  }

  _scheduleReconnect() {
    if (!this.running) return;

    // Exponential backoff with jitter: delay * (0.5 .. 1.5)
    const jitter = 0.5 + Math.random();
    const delay = Math.min(this.reconnectDelay * jitter, this.maxReconnectDelay);

    console.log(`[mastodon][${this.host}] reconnecting in ${Math.round(delay)}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // Double the base delay for next attempt (exponential backoff)
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this._connect();
    }, delay);
  }

  async _handleMessage(raw) {
    try {
      const envelope = JSON.parse(raw.toString());

      // We only care about new statuses ('update' events)
      if (envelope.event !== 'update') return;

      // Mastodon sends the payload as a JSON *string* — parse it again
      const payload = JSON.parse(envelope.payload);

      // Extract and clean text
      const text = stripHtml(payload.content || '').trim();

      // Skip very short posts (noise, emoji-only, etc.)
      if (text.length < MIN_TEXT_LENGTH) return;

      // Build author identifier: username@instance
      const username = payload.account?.username || 'unknown';
      const author = `${username}@${this.host}`;

      // Optional classification
      let topics = [];
      let confidence = 0;
      if (classify) {
        const result = classify(text);
        if (result) {
          topics = result.topics;
          confidence = result.confidence;
        }
      }

      // Write to Redis stream
      await addMessage({ source: 'mastodon', text, author, topics, confidence });
    } catch (err) {
      // Log but don't crash — malformed messages are expected occasionally
      console.error(`[mastodon][${this.host}] message parse error: ${err.message}`);
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Start streaming from all configured Mastodon instances.
 *
 * @param {Array<{host: string, token?: string}>} [customInstances] - Override default instance list
 * @returns {{ stop: () => void }} - Handle to shut down all connections
 */
export function startMastodon(customInstances) {
  const list = customInstances || INSTANCES;

  console.log(`[mastodon] starting ${list.length} instance connections`);

  const instances = list.map(({ host, token }) => {
    const inst = new MastodonInstance(host, token);
    inst.start();
    return inst;
  });

  return {
    stop() {
      console.log('[mastodon] stopping all instance connections');
      instances.forEach((inst) => inst.stop());
    },
  };
}
