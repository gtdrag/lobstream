const HN_API = 'https://hacker-news.firebaseio.com/v0';
const POLL_INTERVAL_MS = 7000; // poll for new items every 7 seconds
const MAX_QUEUE_SIZE = 200;
const FEED_RATE_MS = 4000;

export class HackerNews {
  constructor(onPost) {
    this.onPost = onPost;
    this.queue = [];
    this.feedInterval = null;
    this.pollInterval = null;
    this.lastSeenId = null;
    this.connected = false;
    this.destroyed = false;
  }

  connect() {
    this.startFeedLoop();
    this._startPolling();
  }

  async _startPolling() {
    // Seed with current max item so we only show new items going forward
    try {
      const maxId = await this._fetchMaxItem();
      if (maxId) this.lastSeenId = maxId;
    } catch (e) {
      // Will retry on next poll cycle
    }

    this.connected = true;
    this.pollInterval = setInterval(() => this._poll(), POLL_INTERVAL_MS);
  }

  async _poll() {
    if (this.destroyed) return;

    try {
      const maxId = await this._fetchMaxItem();
      if (!maxId || !this.lastSeenId) {
        if (maxId) this.lastSeenId = maxId;
        return;
      }

      // Fetch new items since last check (cap at 15 to avoid burst)
      const start = this.lastSeenId + 1;
      const end = Math.min(maxId, this.lastSeenId + 15);

      const fetches = [];
      for (let id = start; id <= end; id++) {
        fetches.push(this._fetchItem(id));
      }

      const items = await Promise.all(fetches);
      for (const item of items) {
        if (!item) continue;
        const text = this._extractText(item);
        if (text && this.queue.length < MAX_QUEUE_SIZE) {
          this.queue.push(text);
        }
      }

      this.lastSeenId = end;
    } catch (e) {
      // Silently retry next cycle
    }
  }

  async _fetchMaxItem() {
    const res = await fetch(`${HN_API}/maxitem.json`);
    if (!res.ok) return null;
    return res.json();
  }

  async _fetchItem(id) {
    try {
      const res = await fetch(`${HN_API}/item/${id}.json`);
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      return null;
    }
  }

  _extractText(item) {
    if (!item || item.deleted || item.dead) return null;

    if (item.type === 'story' && item.title) {
      return item.title.trim();
    }

    if (item.type === 'comment' && item.text) {
      return this._stripHtml(item.text).trim();
    }

    return null;
  }

  _stripHtml(html) {
    // Remove HTML tags and decode common entities
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .replace(/\s+/g, ' ');
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
    this.connected = false;
    if (this.feedInterval) {
      clearInterval(this.feedInterval);
      this.feedInterval = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
