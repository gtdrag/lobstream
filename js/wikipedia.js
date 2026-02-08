const WIKIPEDIA_URL = 'https://stream.wikimedia.org/v2/stream/recentchange';
const MAX_QUEUE_SIZE = 200;
const FEED_RATE_MS = 4000;

export class Wikipedia {
  constructor(onPost) {
    this.onPost = onPost;
    this.source = null;
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
      this.source = new EventSource(WIKIPEDIA_URL);
    } catch (e) {
      this._scheduleReconnect();
      return;
    }

    this.source.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 1000;
    };

    this.source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.type === 'edit' &&
          data.comment &&
          data.comment.trim().length > 0
        ) {
          const user = data.user || 'Anonymous';
          const title = data.title || '';
          const comment = data.comment.trim();
          const text = `${user} edited ${title}: ${comment}`;
          if (this.queue.length < MAX_QUEUE_SIZE) {
            this.queue.push(text);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    this.source.onerror = () => {
      this.connected = false;
      if (this.source) {
        this.source.close();
        this.source = null;
      }
      this._scheduleReconnect();
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
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }
}
