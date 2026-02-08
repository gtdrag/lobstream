import { Timeline } from './timeline.js';
import { Reflection } from './reflection.js';
import { BackendStream } from './backend-stream.js';

const feedContainer = document.getElementById('feed');
const breadcrumb = document.getElementById('breadcrumb');
const reflectionCanvas = document.getElementById('reflection-canvas');
const submoltSearch = document.getElementById('submolt-search');
const submoltList = document.getElementById('submolt-list');

const timeline = new Timeline(feedContainer, breadcrumb);
const reflection = new Reflection(reflectionCanvas);

// --- Sidebar submolt nav (built dynamically from received posts) ---

const SUBMOLT_REGEX = /^.+?\s+in\s+(m\/\S+)$/;
const seenSubmolts = new Map(); // submoltKey → post count

function renderSubmoltList(filter) {
  const query = (filter || '').toLowerCase();

  // Sort by post count (most active first)
  const sorted = [...seenSubmolts.entries()]
    .filter(([key]) => !query || key.toLowerCase().includes(query))
    .sort((a, b) => b[1] - a[1]);

  submoltList.innerHTML = '';

  // "All" option
  const allItem = document.createElement('div');
  allItem.className = 'submolt-item' + (!timeline.filter ? ' active' : '');
  allItem.textContent = 'all';
  allItem.addEventListener('click', () => {
    timeline.setFilter(null);
    renderSubmoltList(submoltSearch.value);
  });
  submoltList.appendChild(allItem);

  for (const [submoltKey] of sorted) {
    const item = document.createElement('div');
    item.className = 'submolt-item' + (timeline.filter === submoltKey ? ' active' : '');
    item.textContent = submoltKey;
    item.addEventListener('click', () => {
      timeline.setFilter(submoltKey);
      renderSubmoltList(submoltSearch.value);
    });
    submoltList.appendChild(item);
  }
}

submoltSearch.addEventListener('input', () => {
  renderSubmoltList(submoltSearch.value);
});

// Re-render sidebar when filters change from clicking in a post
const origSetFilter = timeline.setFilter.bind(timeline);
timeline.setFilter = (submolt) => {
  origSetFilter(submolt);
  renderSubmoltList(submoltSearch.value);
};

const origSetAgentFilter = timeline.setAgentFilter.bind(timeline);
timeline.setAgentFilter = (agentName) => {
  origSetAgentFilter(agentName);
  renderSubmoltList(submoltSearch.value);
};

renderSubmoltList('');

// --- Post handler (tracks submolts as they arrive) ---

const addPost = (text, imageUrl, sentiment, author, source, opts) => {
  if (author) {
    const match = author.match(SUBMOLT_REGEX);
    if (match) {
      const key = match[1];
      seenSubmolts.set(key, (seenSubmolts.get(key) || 0) + 1);
      renderSubmoltList(submoltSearch.value);
    }
  }
  timeline.addPost(text, imageUrl, sentiment, author, source, opts);
};

const backendStream = new BackendStream(addPost);

reflection.start();
backendStream.connect();

// Handle resize
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    reflection.resize();
  }, 100);
});
