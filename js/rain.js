const MAX_DROPS = 20;
const MAX_TEXT_LENGTH = 300;
const IMG_MAX_SIZE = 150;

const FONTS = [
  'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace',
  'Georgia, "Times New Roman", serif',
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  '"Courier New", Courier, monospace',
  'Garamond, "Palatino Linotype", "Book Antiqua", serif',
];

const COLORS = [
  'rgb(200, 210, 220)',  // cool white
  'rgb(180, 200, 230)',  // pale blue
  'rgb(220, 190, 180)',  // warm blush
  'rgb(190, 220, 200)',  // soft mint
  'rgb(230, 220, 180)',  // pale gold
  'rgb(210, 185, 220)',  // soft lavender
  'rgb(220, 200, 200)',  // dusty rose
  'rgb(185, 215, 215)',  // sea glass
];

const SHAPES = ['rect'];
const STYLES = ['normal', 'italic'];
const WEIGHTS = ['300', '400', '500'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// URL pattern for auto-linking
const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/g;

function autoLink(text) {
  return text.replace(URL_REGEX, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

// Escape HTML except for our auto-linked <a> tags
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Get the available text width at a given row within a shape
function shapeWidthAt(shape, row, totalRows, maxWidth) {
  const t = totalRows <= 1 ? 0.5 : row / (totalRows - 1);
  switch (shape) {
    case 'circle': {
      const r = Math.sin(t * Math.PI);
      return maxWidth * Math.max(r, 0.15);
    }
    case 'diamond': {
      const d = 1 - Math.abs(2 * t - 1);
      return maxWidth * Math.max(d, 0.15);
    }
    case 'oval': {
      const o = Math.sin(t * Math.PI);
      return maxWidth * Math.max(o * 0.7 + 0.3, 0.2);
    }
    case 'rect':
    default:
      return maxWidth;
  }
}

// Word-wrap text into lines constrained by a shape, using a measuring canvas
function wrapTextInShape(measureCtx, text, shape, maxWidth, fontSize) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [];

  // First pass: estimate line count with simple rect wrap
  const estimatedLines = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if (measureCtx.measureText(testLine).width > maxWidth && currentLine) {
      estimatedLines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) estimatedLines.push(currentLine);

  const totalRows = Math.max(estimatedLines.length, 1);

  // Second pass: wrap respecting shape widths
  const lines = [];
  let wordIdx = 0;
  let row = 0;

  while (wordIdx < words.length && row < totalRows + 5) {
    const rowWidth = shapeWidthAt(shape, row, totalRows, maxWidth);
    let line = '';

    while (wordIdx < words.length) {
      const word = words[wordIdx];
      const testLine = line ? line + ' ' + word : word;
      if (measureCtx.measureText(testLine).width > rowWidth && line) {
        break;
      }
      line = testLine;
      wordIdx++;
    }

    if (line) {
      lines.push({ text: line, maxWidth: rowWidth });
    }
    row++;
  }

  return lines;
}

// Find an X position spread away from existing drops
function spreadX(containerWidth, existingDrops) {
  const margin = 60;
  const range = containerWidth - 400;
  if (range <= 0) return margin;
  if (existingDrops.length === 0) {
    return margin + Math.random() * range;
  }

  let bestX = margin + Math.random() * range;
  let bestMinDist = 0;

  for (let attempt = 0; attempt < 12; attempt++) {
    const candidateX = margin + Math.random() * range;
    let minDist = Infinity;
    for (const drop of existingDrops) {
      const dist = Math.abs(candidateX - drop.x);
      if (dist < minDist) minDist = dist;
    }
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      bestX = candidateX;
    }
  }

  return bestX;
}

// Calculate wrap width that produces a roughly square text block
function squareWidth(measureCtx, text, fontSize) {
  const lineHeight = fontSize * 1.3;
  const totalWidth = measureCtx.measureText(text).width;
  // For a square: side = sqrt(totalWidth * lineHeight)
  const side = Math.sqrt(totalWidth * lineHeight);
  // Clamp between reasonable bounds
  return Math.max(100, Math.min(side, 500));
}

// Offscreen canvas for text measurement
const _measureCanvas = document.createElement('canvas');
const _measureCtx = _measureCanvas.getContext('2d');

class Drop {
  constructor(text, containerWidth, containerHeight, imageUrl, existingDrops) {
    this.text = text.length > MAX_TEXT_LENGTH
      ? text.slice(0, MAX_TEXT_LENGTH) + '...'
      : text;
    this.fontSize = 18 + Math.random() * 34;
    this.font = pick(FONTS);
    this.fontStyle = pick(STYLES);
    this.fontWeight = pick(WEIGHTS);
    this.color = pick(COLORS);
    this.shape = pick(SHAPES);
    // Compute wrap width for a square text block
    const fontStr = `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.font}`;
    _measureCtx.font = fontStr;
    this.wrapWidth = squareWidth(_measureCtx, this.text, this.fontSize);
    this.x = spreadX(containerWidth, existingDrops);
    this.y = containerHeight + 30 + Math.random() * 80;
    this.speed = 0.35 + Math.random() * 0.35;
    this.drift = (Math.random() - 0.5) * 0.04;
    this.baseOpacity = 0.7 + Math.random() * 0.25;
    this.opacity = this.baseOpacity;
    this.alive = true;
    this.imageUrl = imageUrl || null;
    this.containerHeight = containerHeight;

    // Build DOM element
    this.el = document.createElement('div');
    this.el.className = 'drop';
    this.el.style.position = 'absolute';
    this.el.style.left = this.x + 'px';
    this.el.style.top = '0px';
    this.el.style.transform = `translateY(${this.y}px)`;
    this.el.style.opacity = this.opacity;
    this.el.style.pointerEvents = 'auto';
    this.el.style.maxWidth = this.wrapWidth + 'px';
    this.el.style.willChange = 'transform, opacity';

    // Image
    if (this.imageUrl) {
      const img = document.createElement('img');
      img.src = this.imageUrl;
      img.crossOrigin = 'anonymous';
      img.style.maxWidth = IMG_MAX_SIZE + 'px';
      img.style.maxHeight = IMG_MAX_SIZE + 'px';
      img.style.display = 'block';
      img.style.marginBottom = '8px';
      img.style.borderRadius = '4px';
      img.onerror = () => img.remove();
      this.el.appendChild(img);
    }

    // Shaped text lines
    if (this.text) {
      _measureCtx.font = fontStr; // already defined above
      const lines = wrapTextInShape(_measureCtx, this.text, this.shape, this.wrapWidth, this.fontSize);

      for (const line of lines) {
        const lineEl = document.createElement('div');
        lineEl.style.fontFamily = this.font;
        lineEl.style.fontSize = this.fontSize + 'px';
        lineEl.style.fontStyle = this.fontStyle;
        lineEl.style.fontWeight = this.fontWeight;
        lineEl.style.color = this.color;
        lineEl.style.lineHeight = '1.3';
        lineEl.style.textAlign = 'center';
        lineEl.style.maxWidth = line.maxWidth + 'px';
        lineEl.style.margin = '0 auto';
        lineEl.style.wordBreak = 'break-word';
        // Escape HTML then auto-link URLs
        lineEl.innerHTML = autoLink(escapeHtml(line.text));
        this.el.appendChild(lineEl);
      }
    }
  }

  update() {
    this.y -= this.speed;
    this.x += this.drift;

    // Only fade in the last 3% before leaving the screen
    const normalizedY = this.y / this.containerHeight;
    if (normalizedY < 0.03) {
      const fadeProgress = (0.03 - normalizedY) / 0.03;
      this.opacity = this.baseOpacity * (1 - fadeProgress);
    } else {
      this.opacity = this.baseOpacity;
    }

    if (this.opacity <= 0.01 || this.y < -50) {
      this.alive = false;
    }

    // Update DOM
    this.el.style.transform = `translateY(${this.y}px)`;
    this.el.style.left = this.x + 'px';
    this.el.style.opacity = this.opacity;
  }

  remove() {
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}

export class Rain {
  constructor(container) {
    this.container = container;
    this.drops = [];
    this.animationId = null;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.recentTexts = new Map(); // text hash → timestamp for dedup
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  addDrop(text, imageUrl) {
    // Dedup: skip if we've shown this exact text in the last 2 minutes
    const key = text.trim().toLowerCase().slice(0, 120);
    const now = Date.now();
    if (this.recentTexts.has(key)) return;
    this.recentTexts.set(key, now);
    // Prune old entries every so often
    if (this.recentTexts.size > 300) {
      const cutoff = now - 120_000;
      for (const [k, ts] of this.recentTexts) {
        if (ts < cutoff) this.recentTexts.delete(k);
      }
    }

    if (this.drops.length >= MAX_DROPS) {
      const deadIndex = this.drops.findIndex(d => !d.alive);
      if (deadIndex !== -1) {
        this.drops[deadIndex].remove();
        this.drops.splice(deadIndex, 1);
      } else {
        this.drops[0].remove();
        this.drops.shift();
      }
    }
    const drop = new Drop(text, this.width, this.height, imageUrl, this.drops);
    this.container.appendChild(drop.el);
    this.drops.push(drop);
  }

  start() {
    const loop = () => {
      this.update();
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  update() {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      this.drops[i].update();
      if (!this.drops[i].alive) {
        this.drops[i].remove();
        this.drops.splice(i, 1);
      }
    }
  }

  destroy() {
    this.stop();
    for (const drop of this.drops) drop.remove();
    this.drops = [];
  }
}
