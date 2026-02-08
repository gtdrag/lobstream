const JETSTREAM_URL = 'wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post';
const MAX_QUEUE_SIZE = 200;
const FEED_RATE_MS = 8000; // one drop every ~8 seconds

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
          data.commit.record
        ) {
          const record = data.commit.record;
          const text = (record.text || '').trim();
          let imageUrl = null;

          // Extract image from embed if present
          if (
            record.embed &&
            record.embed.$type === 'app.bsky.embed.images' &&
            record.embed.images &&
            record.embed.images.length > 0
          ) {
            const img = record.embed.images[0];
            if (img.image && img.image.ref && img.image.ref.$link) {
              imageUrl = `https://cdn.bsky.app/img/feed_thumbnail/plain/${data.did}/${img.image.ref.$link}@jpeg`;
            }
          }

          if ((text.length > 0 || imageUrl) && this.queue.length < MAX_QUEUE_SIZE) {
            this.queue.push({ text, imageUrl });
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
        const item = this.queue.shift();
        this.onPost(item.text, item.imageUrl);
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
