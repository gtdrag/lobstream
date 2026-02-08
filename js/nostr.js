const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];
const SUB_ID = 'lobstream';
const MAX_QUEUE_SIZE = 200;
const FEED_RATE_MS = 4000;

export class Nostr {
  constructor(onPost) {
    this.onPost = onPost;
    this.sockets = [];
    this.queue = [];
    this.reconnectDelay = new Map();
    this.maxReconnectDelay = 30000;
    this.feedInterval = null;
    this.destroyed = false;
  }

  connect() {
    this.destroyed = false;
    this.startFeedLoop();
    for (const relay of RELAYS) {
      this._connect(relay);
    }
  }

  _connect(relay) {
    if (this.destroyed) return;

    let ws;
    try {
      ws = new WebSocket(relay);
    } catch (e) {
      this._scheduleReconnect(relay);
      return;
    }

    this.sockets.push(ws);

    ws.onopen = () => {
      this.reconnectDelay.set(relay, 1000);
      const req = JSON.stringify(['REQ', SUB_ID, { kinds: [1], limit: 0 }]);
      ws.send(req);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          Array.isArray(data) &&
          data[0] === 'EVENT' &&
          data[1] === SUB_ID &&
          data[2] &&
          data[2].content
        ) {
          const text = data[2].content.trim();
          if (text.length > 0 && this.queue.length < MAX_QUEUE_SIZE) {
            this.queue.push(text);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      this._removeSocket(ws);
      this._scheduleReconnect(relay);
    };

    ws.onerror = () => {
      this._removeSocket(ws);
      ws.close();
    };
  }

  _removeSocket(ws) {
    const idx = this.sockets.indexOf(ws);
    if (idx !== -1) {
      this.sockets.splice(idx, 1);
    }
  }

  _scheduleReconnect(relay) {
    if (this.destroyed) return;
    const baseDelay = this.reconnectDelay.get(relay) || 1000;
    const jitter = Math.random() * 1000;
    setTimeout(() => this._connect(relay), baseDelay + jitter);
    this.reconnectDelay.set(relay, Math.min(baseDelay * 2, this.maxReconnectDelay));
  }

  startFeedLoop() {
    if (this.feedInterval) return;
    this.feedInterval = setInterval(() => {
      if (this.queue.length > 0) {
        const text = this.queue.shift();
        this.onPost(text);
      }
    }, FEED_RATE_MS);
  }

  destroy() {
    this.destroyed = true;
    if (this.feedInterval) {
      clearInterval(this.feedInterval);
      this.feedInterval = null;
    }
    for (const ws of this.sockets) {
      ws.close();
    }
    this.sockets = [];
    this.queue = [];
  }
}
