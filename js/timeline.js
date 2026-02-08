const MAX_POSTS = 100;
const MAX_TEXT_LENGTH = 500;

const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/g;
const SUBMOLT_REGEX = /^(.+?)\s+in\s+(m\/\S+)$/;

// Deterministic hue from submolt name — gives each submolt a subtle color identity
function submoltHue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return ((h % 360) + 360) % 360;
}

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
    this.filter = null;       // submolt filter, e.g. "m/consciousness"
    this.agentFilter = null;  // agent name filter, e.g. "Prometheus"
    this.allCards = [];
    this.detailOverlay = null;

    this.container.addEventListener('scroll', () => {
      this.userScrolled = this.container.scrollTop > 40;
    });

    // Close detail on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeDetail();
    });
  }

  // --- Filtering ---

  _matchesFilter(entry) {
    if (this.filter && entry.submolt !== this.filter) return false;
    if (this.agentFilter && entry.agentName !== this.agentFilter) return false;
    return true;
  }

  _applyFilters() {
    this.userScrolled = false;

    for (const entry of this.allCards) {
      if (this._matchesFilter(entry)) {
        entry.card.classList.remove('hiding', 'hidden-filtered');
      } else {
        entry.card.classList.add('hiding');
        setTimeout(() => {
          if (entry.card.classList.contains('hiding')) {
            entry.card.classList.add('hidden-filtered');
          }
        }, 250);
      }
    }

    this._updateBreadcrumb();
    this.container.scrollTop = 0;
  }

  setFilter(submolt) {
    this.filter = submolt;
    // Clear agent filter when changing submolt context
    if (!submolt) this.agentFilter = null;
    this._applyFilters();
  }

  setAgentFilter(agentName) {
    this.agentFilter = agentName;
    this._applyFilters();
  }

  _updateBreadcrumb() {
    const hasFilter = this.filter || this.agentFilter;

    if (!hasFilter) {
      this.breadcrumb.classList.remove('visible');
      return;
    }

    this.breadcrumb.innerHTML = '';

    // "all" link
    const allLink = document.createElement('span');
    allLink.className = 'bc-link';
    allLink.textContent = 'all';
    allLink.addEventListener('click', () => {
      this.agentFilter = null;
      this.setFilter(null);
    });
    this.breadcrumb.appendChild(allLink);

    // Submolt segment
    if (this.filter) {
      const sep = document.createElement('span');
      sep.className = 'bc-sep';
      sep.textContent = '/';
      this.breadcrumb.appendChild(sep);

      if (this.agentFilter) {
        // Submolt is clickable to go back to submolt-only view
        const subLink = document.createElement('span');
        subLink.className = 'bc-link';
        subLink.textContent = this.filter;
        subLink.addEventListener('click', () => this.setAgentFilter(null));
        this.breadcrumb.appendChild(subLink);
      } else {
        const current = document.createElement('span');
        current.className = 'bc-current';
        current.textContent = this.filter;
        this.breadcrumb.appendChild(current);
      }
    }

    // Agent segment
    if (this.agentFilter) {
      const sep = document.createElement('span');
      sep.className = 'bc-sep';
      sep.textContent = '/';
      this.breadcrumb.appendChild(sep);

      const current = document.createElement('span');
      current.className = 'bc-current';
      current.textContent = this.agentFilter;
      this.breadcrumb.appendChild(current);
    }

    this.breadcrumb.classList.add('visible');
  }

  // --- Detail modal ---

  openDetail(entry) {
    this.closeDetail();

    const overlay = document.createElement('div');
    overlay.className = 'detail-overlay';
    this.detailOverlay = overlay;

    const panel = document.createElement('div');
    panel.className = 'detail-panel';

    // Close button
    const closeBtn = document.createElement('div');
    closeBtn.className = 'detail-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => this.closeDetail());

    // Header
    const header = document.createElement('div');
    header.className = 'detail-header';

    const author = document.createElement('span');
    author.className = 'detail-author';

    const nameLink = document.createElement('span');
    nameLink.className = 'detail-agent-link';
    nameLink.textContent = entry.agentName;
    nameLink.addEventListener('click', () => {
      this.closeDetail();
      this.setAgentFilter(entry.agentName);
    });
    author.appendChild(nameLink);

    if (entry.submolt) {
      author.appendChild(document.createTextNode(' in '));
      const badge = document.createElement('span');
      badge.className = 'detail-submolt';
      badge.textContent = entry.submolt;
      badge.addEventListener('click', () => {
        this.closeDetail();
        this.setFilter(entry.submolt);
      });
      author.appendChild(badge);
    }
    header.appendChild(author);

    const time = document.createElement('span');
    time.className = 'detail-time';
    time.textContent = entry.timeLabel || 'just now';
    header.appendChild(time);

    panel.appendChild(closeBtn);
    panel.appendChild(header);

    // Full text (not truncated)
    if (entry.fullText) {
      const text = document.createElement('div');
      text.className = 'detail-text';
      text.innerHTML = autoLink(escapeHtml(entry.fullText));
      panel.appendChild(text);
    }

    // Image
    if (entry.imageUrl) {
      const img = document.createElement('img');
      img.className = 'detail-image';
      img.src = entry.imageUrl;
      img.crossOrigin = 'anonymous';
      img.onerror = () => img.remove();
      panel.appendChild(img);
    }

    // Meta footer
    const meta = document.createElement('div');
    meta.className = 'detail-meta';
    if (entry.source) {
      const src = document.createElement('span');
      src.className = 'detail-meta-item';
      src.textContent = entry.source;
      meta.appendChild(src);
    }
    if (entry.sentiment) {
      const sent = document.createElement('span');
      sent.className = 'detail-meta-item';
      sent.textContent = entry.sentiment;
      meta.appendChild(sent);
    }
    if (entry.submolt) {
      const sub = document.createElement('span');
      sub.className = 'detail-meta-item';
      sub.textContent = entry.submolt;
      meta.appendChild(sub);
    }
    if (meta.children.length) panel.appendChild(meta);

    overlay.appendChild(panel);

    // Click overlay backdrop to close (not the panel itself)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeDetail();
    });

    document.body.appendChild(overlay);

    // Trigger animation on next frame
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });
  }

  closeDetail() {
    if (!this.detailOverlay) return;
    const overlay = this.detailOverlay;
    this.detailOverlay = null;

    overlay.classList.remove('visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    // Fallback removal
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 400);
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

    // Keep full text, truncate for card display
    const fullText = text || '';
    let displayText = fullText;
    if (displayText.length > MAX_TEXT_LENGTH) {
      displayText = displayText.slice(0, MAX_TEXT_LENGTH) + '\u2026';
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

    // Per-submolt subtle tint (border + faint background)
    if (submolt) {
      const hue = submoltHue(submolt);
      if (!sentiment) {
        card.style.borderLeftColor = `hsl(${hue} 40% 40%)`;
      }
      card.style.setProperty('--submolt-hue', hue);
    }

    // Header
    const header = document.createElement('div');
    header.className = 'post-card-header';

    const authorEl = document.createElement('span');
    authorEl.className = 'post-card-author';

    // Agent name — always clickable
    const agentLink = document.createElement('span');
    agentLink.className = 'post-card-agent';
    agentLink.textContent = agentName;
    agentLink.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setAgentFilter(agentName);
    });
    authorEl.appendChild(agentLink);

    if (submolt) {
      authorEl.appendChild(document.createTextNode(' in '));

      const submoltLink = document.createElement('span');
      submoltLink.className = 'post-card-submolt';
      submoltLink.textContent = submolt;
      submoltLink.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setFilter(submolt);
      });
      authorEl.appendChild(submoltLink);
    }
    header.appendChild(authorEl);

    const timeEl = document.createElement('span');
    timeEl.className = 'post-card-time';
    timeEl.textContent = 'just now';
    header.appendChild(timeEl);

    card.appendChild(header);

    // Track entry data (needed for detail view)
    const entry = {
      card, submolt, agentName, fullText, imageUrl, sentiment, source,
      timeLabel: 'just now',
    };

    // Text
    if (displayText) {
      const textEl = document.createElement('div');
      textEl.className = 'post-card-text';
      textEl.innerHTML = autoLink(escapeHtml(displayText));
      textEl.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') return;
        if (this.filter && submolt) {
          // Already inside a submolt — open detail view
          this.openDetail(entry);
        } else if (submolt) {
          // At root — drill into submolt
          this.setFilter(submolt);
        }
      });
      card.appendChild(textEl);
    }

    // Image
    if (imageUrl) {
      const img = document.createElement('img');
      img.className = 'post-card-image';
      img.src = imageUrl;
      img.crossOrigin = 'anonymous';
      img.loading = 'lazy';
      img.onload = () => img.classList.add('loaded');
      img.onerror = () => img.remove();
      card.appendChild(img);
    }

    // Track for filtering
    this.allCards.unshift(entry);

    // Apply current filters
    if (!this._matchesFilter(entry)) {
      card.classList.add('hiding', 'hidden-filtered');
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
