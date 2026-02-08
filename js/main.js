import { Rain } from './rain.js';
import { Reflection } from './reflection.js';
import { Jetstream } from './jetstream.js';
import { Nostr } from './nostr.js';
import { Wikipedia } from './wikipedia.js';
import { HackerNews } from './hackernews.js';
import { BackendStream } from './backend-stream.js';
import { matchesAICoding } from './topic-filter.js';

// Initialize
const dropContainer = document.getElementById('drop-container');
const reflectionCanvas = document.getElementById('reflection-canvas');

const rain = new Rain(dropContainer);
const reflection = new Reflection(reflectionCanvas);

// Shared callback — all sources feed into the same rain
// Filter browser-native sources for AI coding content
const addDrop = (text, imageUrl) => rain.addDrop(text, imageUrl);
const addFilteredDrop = (text, imageUrl) => {
  if (matchesAICoding(text)) addDrop(text, imageUrl);
};

// Connect all data sources
// Browser-native sources: filtered client-side for AI coding
const jetstream = new Jetstream(addFilteredDrop);
const nostr = new Nostr(addFilteredDrop);
const wikipedia = new Wikipedia(addFilteredDrop);
const hackernews = new HackerNews(addFilteredDrop);
// Backend sources: filtered server-side via topics param
const backendStream = new BackendStream(addDrop, { topics: ['ai', 'tech', 'crypto', 'finance', 'geopolitics', 'science', 'politics', 'openclaw'] });

// Start animation loops
rain.start();
reflection.start();

// Connect all sources
jetstream.connect();
nostr.connect();
wikipedia.connect();
hackernews.connect();
backendStream.connect();

// Handle resize
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    rain.resize();
    reflection.resize();
  }, 100);
});

// Hide cursor after 3 seconds of inactivity
let cursorTimeout;
document.body.classList.add('cursor-visible');

const showCursor = () => {
  document.body.classList.add('cursor-visible');
  clearTimeout(cursorTimeout);
  cursorTimeout = setTimeout(() => {
    document.body.classList.remove('cursor-visible');
  }, 3000);
};

window.addEventListener('mousemove', showCursor);
window.addEventListener('mousedown', showCursor);

// Start cursor hide timer
cursorTimeout = setTimeout(() => {
  document.body.classList.remove('cursor-visible');
}, 3000);
