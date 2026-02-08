const FEED_RATE_MS = 4000;
const MAX_QUEUE_SIZE = 200;

export class BackendStream {
  constructor(onPost, options = {}) {
    this.onPost = onPost;
    this.sources = options.sources || [];
    this.topics = options.topics || [];
    this.eventSource = null;
    this.queue = [];
    this.feedInterval = null;
    this.seen = new Set();
  }

  connect() {
    this.startFeedLoop();

    const params = new URLSearchParams();
    if (this.sources.length) params.set('sources', this.sources.join(','));
    if (this.topics.length) params.set('topics', this.topics.join(','));

    const query = params.toString();
    const url = `/api/stream${query ? '?' + query : ''}`;
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('connected', () => {
      console.log('[BackendStream] connected to SSE');
    });

    this.eventSource.addEventListener('post', (e) => {
      try {
        const id = e.lastEventId;
        if (id && this.seen.has(id)) return;
        if (id) {
          this.seen.add(id);
          if (this.seen.size > 500) {
            const it = this.seen.values();
            for (let i = 0; i < 200; i++) it.next();
            this.seen = new Set(Array.from(it));
          }
        }
        const data = JSON.parse(e.data);
        if (this.queue.length < MAX_QUEUE_SIZE) {
          this.queue.push({
            text: data.text || '',
            imageUrl: data.imageUrl || null,
            source: data.source || 'unknown',
            topics: data.topics ? data.topics.split(',').filter(Boolean) : [],
          });
        }
      } catch {
        // ignore parse errors
      }
    });

    this.eventSource.addEventListener('heartbeat', () => {
      // heartbeat received, connection is alive
    });

    this.eventSource.addEventListener('error', (e) => {
      if (e.data) {
        try {
          const err = JSON.parse(e.data);
          console.warn('[BackendStream] server error:', err.message);
        } catch {
          // ignore
        }
      }
    });

    this.eventSource.onerror = () => {
      // EventSource auto-reconnects on connection loss.
      // The browser will retry after a brief delay.
      console.warn('[BackendStream] connection error, will auto-reconnect');
    };
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
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.queue = [];
  }
}
