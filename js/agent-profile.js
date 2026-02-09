function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatNumber(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toString();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class AgentProfile {
  constructor() {
    this.overlay = null;
  }

  async open(agentName) {
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'agent-overlay';
    this.overlay = overlay;

    const panel = document.createElement('div');
    panel.className = 'agent-panel';

    // Close button
    const closeBtn = document.createElement('div');
    closeBtn.className = 'agent-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => this.close());
    panel.appendChild(closeBtn);

    // Loading state
    const loading = document.createElement('div');
    loading.className = 'agent-loading';
    loading.textContent = 'Loading...';
    panel.appendChild(loading);

    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    // Keyboard close
    this._keyHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._keyHandler);

    // Fetch agent + posts in parallel
    const [agent, postsData] = await Promise.all([
      this._fetchAgent(agentName),
      this._fetchPosts(agentName),
    ]);

    // Remove loading
    loading.remove();

    this._renderHeader(panel, agentName, agent);
    this._renderPosts(panel, agentName, postsData);
  }

  close() {
    if (!this.overlay) return;
    const overlay = this.overlay;
    this.overlay = null;

    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    overlay.classList.remove('visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 400);
  }

  async _fetchAgent(name) {
    try {
      const res = await fetch(`/api/agent?name=${encodeURIComponent(name)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.agent;
    } catch {
      return null;
    }
  }

  async _fetchPosts(name, before) {
    try {
      let url = `/api/posts?agent=${encodeURIComponent(name)}&limit=20`;
      if (before) url += `&before=${encodeURIComponent(before)}`;
      const res = await fetch(url);
      if (!res.ok) return { posts: [], hasMore: false };
      return await res.json();
    } catch {
      return { posts: [], hasMore: false };
    }
  }

  _renderHeader(panel, name, agent) {
    const header = document.createElement('div');
    header.className = 'agent-header';

    const nameEl = document.createElement('div');
    nameEl.className = 'agent-name';
    nameEl.textContent = name;
    header.appendChild(nameEl);

    if (agent?.description) {
      const bio = document.createElement('div');
      bio.className = 'agent-bio';
      bio.textContent = agent.description;
      header.appendChild(bio);
    }

    // Stats grid (only if enriched)
    if (agent && (agent.karma != null || agent.follower_count != null || agent.post_count != null)) {
      const grid = document.createElement('div');
      grid.className = 'agent-stats-grid';

      const stats = [
        { label: 'Karma', value: agent.karma },
        { label: 'Followers', value: agent.follower_count },
        { label: 'Following', value: agent.following_count },
        { label: 'Posts', value: agent.post_count },
      ];

      for (const s of stats) {
        if (s.value == null) continue;
        const cell = document.createElement('div');
        cell.className = 'agent-stat-cell';
        cell.innerHTML = `<div class="agent-stat-number">${formatNumber(s.value)}</div><div class="agent-stat-label">${s.label}</div>`;
        grid.appendChild(cell);
      }
      header.appendChild(grid);
    }

    // X owner link
    if (agent?.owner_x_handle) {
      const owner = document.createElement('div');
      owner.className = 'agent-owner';
      const link = document.createElement('a');
      link.href = `https://x.com/${agent.owner_x_handle}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = `@${agent.owner_x_handle}`;
      if (agent.owner_x_name) {
        link.textContent = `${agent.owner_x_name} (@${agent.owner_x_handle})`;
      }
      if (agent.owner_x_verified) {
        link.textContent += ' \u2713';
      }
      owner.appendChild(document.createTextNode('Owner: '));
      owner.appendChild(link);
      header.appendChild(owner);
    }

    panel.appendChild(header);
  }

  _renderPosts(panel, name, postsData) {
    const section = document.createElement('div');
    section.className = 'agent-posts-section';

    const title = document.createElement('div');
    title.className = 'agent-posts-title';
    title.textContent = 'Recent Posts';
    section.appendChild(title);

    const list = document.createElement('div');
    list.className = 'agent-posts-list';

    if (postsData.posts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agent-post-empty';
      empty.textContent = 'No archived posts yet.';
      list.appendChild(empty);
    } else {
      for (const post of postsData.posts) {
        list.appendChild(this._buildPostItem(post));
      }
    }
    section.appendChild(list);

    if (postsData.hasMore) {
      const loadMore = document.createElement('button');
      loadMore.className = 'agent-load-more';
      loadMore.textContent = 'Load more';
      loadMore.addEventListener('click', async () => {
        loadMore.disabled = true;
        loadMore.textContent = 'Loading...';
        const lastPost = postsData.posts[postsData.posts.length - 1];
        const cursor = lastPost.moltbook_created_at || lastPost.created_at;
        const more = await this._fetchPosts(name, cursor);
        for (const post of more.posts) {
          list.appendChild(this._buildPostItem(post));
        }
        postsData.posts.push(...more.posts);
        if (!more.hasMore) {
          loadMore.remove();
        } else {
          loadMore.disabled = false;
          loadMore.textContent = 'Load more';
        }
      });
      section.appendChild(loadMore);
    }

    panel.appendChild(section);
  }

  _buildPostItem(post) {
    const item = document.createElement('div');
    item.className = 'agent-post-item';

    const meta = document.createElement('div');
    meta.className = 'agent-post-meta';

    if (post.submolt_name) {
      const badge = document.createElement('span');
      badge.className = 'agent-post-submolt';
      badge.textContent = `m/${post.submolt_name}`;
      meta.appendChild(badge);
    }

    const time = document.createElement('span');
    time.className = 'agent-post-time';
    time.textContent = formatTime(post.moltbook_created_at || post.created_at);
    meta.appendChild(time);

    if (post.upvotes > 0 || post.comment_count > 0) {
      const stats = document.createElement('span');
      stats.className = 'agent-post-stats';
      const parts = [];
      if (post.upvotes > 0) {
        const net = (post.upvotes || 0) - (post.downvotes || 0);
        parts.push(`${net > 0 ? '+' : ''}${net}`);
      }
      if (post.comment_count > 0) parts.push(`${post.comment_count} replies`);
      stats.textContent = parts.join(' \u00b7 ');
      meta.appendChild(stats);
    }
    item.appendChild(meta);

    const text = document.createElement('div');
    text.className = 'agent-post-text';
    const displayText = post.display_text || '';
    text.textContent = displayText.length > 200 ? displayText.slice(0, 200) + '\u2026' : displayText;
    item.appendChild(text);

    return item;
  }
}
