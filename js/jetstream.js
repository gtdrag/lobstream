const JETSTREAM_URL = 'wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post';
const MAX_QUEUE_SIZE = 200;
const FEED_RATE_MS = 350; // ~3 new drops per second

export class Jetstream {
  constructor(onPost) {
    this.onPost = onPost;
    this.ws = null;
    this.queue = [];
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.feedInterval = null;
    this.connected = false;
  }

  connect() {
    this.startFeedLoop();
    this._connect();
  }

  _connect() {
    try {
      this.ws = new WebSocket(JETSTREAM_URL);
    } catch (e) {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 1000;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.kind === 'commit' &&
          data.commit &&
          data.commit.operation === 'create' &&
          data.commit.record &&
          data.commit.record.text
        ) {
          const text = data.commit.record.text.trim();
          if (text.length > 0 && this.queue.length < MAX_QUEUE_SIZE) {
            this.queue.push(text);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.connected = false;
      if (this.ws) {
        this.ws.close();
      }
    };
  }

  _scheduleReconnect() {
    const jitter = Math.random() * 1000;
    setTimeout(() => this._connect(), this.reconnectDelay + jitter);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
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
    if (this.feedInterval) {
      clearInterval(this.feedInterval);
      this.feedInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
