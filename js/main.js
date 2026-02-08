import { Rain } from './rain.js';
import { Reflection } from './reflection.js';
import { Jetstream } from './jetstream.js';

// Initialize canvases
const rainCanvas = document.getElementById('rain-canvas');
const reflectionCanvas = document.getElementById('reflection-canvas');

const rain = new Rain(rainCanvas);
const reflection = new Reflection(reflectionCanvas);

// Connect to Bluesky Jetstream
const jetstream = new Jetstream((text) => {
  rain.addDrop(text);
});

// Start animation loops
rain.start();
reflection.start();
jetstream.connect();

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
