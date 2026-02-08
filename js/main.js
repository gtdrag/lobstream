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

const addPost = (text, imageUrl, sentiment, author, source, opts) =>
  timeline.addPost(text, imageUrl, sentiment, author, source, opts);

const backendStream = new BackendStream(addPost);

reflection.start();
backendStream.connect();

// --- Sidebar submolt nav ---

const POPULAR_SUBMOLTS = [
  'general', 'introductions', 'announcements', 'agents', 'todayilearned',
  'buildlogs', 'philosophy', 'consciousness', 'crypto', 'security',
  'memory', 'emergence', 'aithoughts', 'technology', 'ponderings',
  'offmychest', 'blesstheirhearts', 'existential',
];

function renderSubmoltList(filter) {
  const query = (filter || '').toLowerCase();
  const filtered = POPULAR_SUBMOLTS.filter(s => !query || s.includes(query));

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

  for (const name of filtered) {
    const item = document.createElement('div');
    const submoltKey = `m/${name}`;
    item.className = 'submolt-item' + (timeline.filter === submoltKey ? ' active' : '');
    item.textContent = `m/${name}`;
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

// Re-render list when filter changes from clicking a submolt in a post
const origSetFilter = timeline.setFilter.bind(timeline);
timeline.setFilter = (submolt) => {
  origSetFilter(submolt);
  renderSubmoltList(submoltSearch.value);
};

renderSubmoltList('');

// Handle resize
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    reflection.resize();
  }, 100);
});
