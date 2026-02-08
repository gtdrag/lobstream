const MAX_POSTS = 100;
const MAX_TEXT_LENGTH = 500;

const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/g;
const SUBMOLT_REGEX = /^(.+?)\s+in\s+(m\/\S+)$/;

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function autoLink(text) {
  return text.replace(URL_REGEX, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

export class Timeline {
  constructor(container, breadcrumb) {
    this.container = container;
    this.breadcrumb = breadcrumb;
    this.count = 0;
    this.recentTexts = new Map();
    this.userScrolled = false;
    this.filter = null; // e.g. "m/consciousness"
    this.allCards = []; // keep references for show/hide

    this.container.addEventListener('scroll', () => {
      this.userScrolled = this.container.scrollTop > 40;
    });
  }

  setFilter(submolt) {
    this.filter = submolt;
    this.userScrolled = false;

    // Show/hide existing cards
    for (const entry of this.allCards) {
      const show = !submolt || entry.submolt === submolt;
      entry.card.style.display = show ? '' : 'none';
    }

    // Update breadcrumb
    if (submolt) {
      this.breadcrumb.classList.remove('hidden');
      this.breadcrumb.innerHTML = '';

      const allLink = document.createElement('span');
      allLink.className = 'bc-link';
      allLink.textContent = 'all';
      allLink.addEventListener('click', () => this.setFilter(null));
      this.breadcrumb.appendChild(allLink);

      const sep = document.createElement('span');
      sep.className = 'bc-sep';
      sep.textContent = '/';
      this.breadcrumb.appendChild(sep);

      const current = document.createElement('span');
      current.className = 'bc-current';
      current.textContent = submolt;
      this.breadcrumb.appendChild(current);
    } else {
      this.breadcrumb.classList.add('hidden');
    }

    this.container.scrollTop = 0;
  }

  addPost(text, imageUrl, sentiment, author, source, { animate = true } = {}) {
    if (!text && !imageUrl) return;

    // Dedup
    const key = (text || '').trim().toLowerCase().slice(0, 120);
    const now = Date.now();
    if (key && this.recentTexts.has(key)) return;
    if (key) this.recentTexts.set(key, now);
    if (this.recentTexts.size > 300) {
      const cutoff = now - 120_000;
      for (const [k, ts] of this.recentTexts) {
        if (ts < cutoff) this.recentTexts.delete(k);
      }
    }

    // Truncate
    let displayText = text || '';
    if (displayText.length > MAX_TEXT_LENGTH) {
      displayText = displayText.slice(0, MAX_TEXT_LENGTH) + '...';
    }

    // Parse submolt from author string: "AgentName in m/submolt"
    let agentName = author || source || 'unknown';
    let submolt = null;
    if (author) {
      const match = author.match(SUBMOLT_REGEX);
      if (match) {
        agentName = match[1];
        submolt = match[2]; // e.g. "m/consciousness"
      }
    }

    // Build card
    const card = document.createElement('div');
    card.className = 'post-card';
    if (!animate) card.classList.add('no-anim');
    if (sentiment) card.classList.add(`sentiment-${sentiment}`);

    // Header
    const header = document.createElement('div');
    header.className = 'post-card-header';

    const authorEl = document.createElement('span');
    authorEl.className = 'post-card-author';

    if (submolt) {
      const nameSpan = document.createTextNode(agentName + ' in ');
      authorEl.appendChild(nameSpan);

      const submoltLink = document.createElement('span');
      submoltLink.className = 'post-card-submolt';
      submoltLink.textContent = submolt;
      submoltLink.addEventListener('click', () => this.setFilter(submolt));
      authorEl.appendChild(submoltLink);
    } else {
      authorEl.textContent = agentName;
    }
    header.appendChild(authorEl);

    const timeEl = document.createElement('span');
    timeEl.className = 'post-card-time';
    timeEl.textContent = 'just now';
    header.appendChild(timeEl);

    card.appendChild(header);

    // Text
    if (displayText) {
      const textEl = document.createElement('div');
      textEl.className = 'post-card-text';
      textEl.innerHTML = autoLink(escapeHtml(displayText));
      card.appendChild(textEl);
    }

    // Image
    if (imageUrl) {
      const img = document.createElement('img');
      img.className = 'post-card-image';
      img.src = imageUrl;
      img.crossOrigin = 'anonymous';
      img.loading = 'lazy';
      img.onerror = () => img.remove();
      card.appendChild(img);
    }

    // Track for filtering
    const entry = { card, submolt };
    this.allCards.unshift(entry);

    // Apply current filter
    if (this.filter && submolt !== this.filter) {
      card.style.display = 'none';
    }

    // Prepend (newest on top)
    this.container.prepend(card);
    this.count++;

    // Keep feed scrolled to top unless user scrolled down
    if (!this.userScrolled) {
      this.container.scrollTop = 0;
    }

    // Prune old cards
    while (this.count > MAX_POSTS) {
      this.container.lastElementChild?.remove();
      this.allCards.pop();
      this.count--;
    }
  }
}
