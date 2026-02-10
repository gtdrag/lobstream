const FEED_RATE_MS = 8000;
const MAX_QUEUE_SIZE = 200;
const BACKFILL_FLUSH_DELAY = 300; // ms after connect to flush initial batch

export class BackendStream {
  constructor(onPost, options = {}) {
    this.onPost = onPost;
    this.sources = options.sources || [];
    this.topics = options.topics || [];
    this.eventSource = null;
    this.queue = [];
    this.feedInterval = null;
    this.seen = new Set();
    this.connected = false;
    this.backfillFlushed = false;
  }

  connect() {
    const params = new URLSearchParams();
    if (this.sources.length) params.set('sources', this.sources.join(','));
    if (this.topics.length) params.set('topics', this.topics.join(','));

    const query = params.toString();
    const url = `/api/stream${query ? '?' + query : ''}`;
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('connected', () => {
      console.log('[BackendStream] connected to SSE');
      this.connected = true;

      // After a short delay, flush everything we've received as the backfill
      setTimeout(() => {
        this.flushBackfill();
      }, BACKFILL_FLUSH_DELAY);
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
        const item = {
          text: data.text || '',
          imageUrl: data.imageUrl || null,
          source: data.source || 'unknown',
          author: data.author || null,
          topics: data.topics ? data.topics.split(',').filter(Boolean) : [],
          sentiment: data.sentiment || null,
          upvotes: data.upvotes ? parseInt(data.upvotes, 10) : 0,
          downvotes: data.downvotes ? parseInt(data.downvotes, 10) : 0,
          commentCount: data.commentCount ? parseInt(data.commentCount, 10) : 0,
          createdAt: data.createdAt || null,
          moltbookId: data.moltbookId || null,
        };

        if (this.backfillFlushed) {
          // After backfill, drip new posts through the queue
          if (this.queue.length < MAX_QUEUE_SIZE) {
            this.queue.push(item);
          }
        } else {
          // Before backfill flush, collect everything
          this.queue.push(item);
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
      console.warn('[BackendStream] connection error, will auto-reconnect');
    };
  }

  flushBackfill() {
    // Render all queued backfill posts immediately, no animation
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      this.onPost(item.text, item.imageUrl, item.sentiment, item.author, item.source, {
        animate: false, upvotes: item.upvotes, downvotes: item.downvotes,
        commentCount: item.commentCount, createdAt: item.createdAt,
        moltbookId: item.moltbookId,
      });
    }
    this.backfillFlushed = true;
    this.startFeedLoop();
  }

  startFeedLoop() {
    if (this.feedInterval) return;
    this.feedInterval = setInterval(() => {
      if (this.queue.length > 0) {
        const item = this.queue.shift();
        this.onPost(item.text, item.imageUrl, item.sentiment, item.author, item.source, {
          upvotes: item.upvotes, downvotes: item.downvotes,
          commentCount: item.commentCount, createdAt: item.createdAt,
          moltbookId: item.moltbookId,
        });
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
