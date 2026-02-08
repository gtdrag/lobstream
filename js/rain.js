const MAX_DROPS = 4;
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
  [200, 210, 220],  // cool white
  [180, 200, 230],  // pale blue
  [220, 190, 180],  // warm blush
  [190, 220, 200],  // soft mint
  [230, 220, 180],  // pale gold
  [210, 185, 220],  // soft lavender
  [220, 200, 200],  // dusty rose
  [185, 215, 215],  // sea glass
];

const SHAPES = ['rect', 'circle', 'diamond', 'oval'];
const STYLES = ['normal', 'italic'];
const WEIGHTS = ['300', '400', '500'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Get the available text width at a given row within a shape
function shapeWidthAt(shape, row, totalRows, maxWidth) {
  const t = totalRows <= 1 ? 0.5 : row / (totalRows - 1); // 0 to 1
  switch (shape) {
    case 'circle': {
      // Circle: width varies by sin
      const r = Math.sin(t * Math.PI);
      return maxWidth * Math.max(r, 0.15);
    }
    case 'diamond': {
      // Diamond: widest in middle, tapers to points
      const d = 1 - Math.abs(2 * t - 1);
      return maxWidth * Math.max(d, 0.15);
    }
    case 'oval': {
      // Oval: like circle but wider
      const o = Math.sin(t * Math.PI);
      return maxWidth * Math.max(o * 0.7 + 0.3, 0.2);
    }
    case 'rect':
    default:
      return maxWidth;
  }
}

// Word-wrap text into lines constrained by a shape
function wrapTextInShape(ctx, text, shape, maxWidth, lineHeight) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [];

  // First pass: estimate how many lines we need with simple rect wrap
  const estimatedLines = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
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
      if (ctx.measureText(testLine).width > rowWidth && line) {
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

class Drop {
  constructor(text, canvasWidth, canvasHeight, imageUrl) {
    this.text = text.length > MAX_TEXT_LENGTH
      ? text.slice(0, MAX_TEXT_LENGTH) + '...'
      : text;
    this.fontSize = 18 + Math.random() * 34; // 18-52px
    this.font = pick(FONTS);
    this.fontStyle = pick(STYLES);
    this.fontWeight = pick(WEIGHTS);
    this.color = pick(COLORS);
    this.shape = pick(SHAPES);
    this.wrapWidth = 180 + Math.random() * 350; // 180-530px
    this.x = 60 + Math.random() * (canvasWidth - 400);
    this.y = -30 - Math.random() * 80;
    this.speed = 0.12 + Math.random() * 0.18;
    this.drift = (Math.random() - 0.5) * 0.04;
    this.baseOpacity = 0.7 + Math.random() * 0.25;
    this.opacity = this.baseOpacity;
    this.alive = true;
    this.wrappedLines = null; // computed lazily on first draw

    // Image support
    this.image = null;
    this.imageLoaded = false;
    this.imageWidth = 0;
    this.imageHeight = 0;
    if (imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageLoaded = true;
        const aspect = img.naturalWidth / img.naturalHeight;
        if (aspect >= 1) {
          this.imageWidth = IMG_MAX_SIZE;
          this.imageHeight = IMG_MAX_SIZE / aspect;
        } else {
          this.imageHeight = IMG_MAX_SIZE;
          this.imageWidth = IMG_MAX_SIZE * aspect;
        }
      };
      img.onerror = () => {};
      img.src = imageUrl;
      this.image = img;
    }
  }

  update(canvasHeight) {
    this.y += this.speed;
    this.x += this.drift;

    const normalizedY = this.y / canvasHeight;
    if (normalizedY > 0.90) {
      const fadeProgress = (normalizedY - 0.90) / 0.10;
      this.opacity = this.baseOpacity * (1 - fadeProgress);
    } else {
      this.opacity = this.baseOpacity;
    }

    if (this.opacity <= 0.01 || this.y > canvasHeight + 20) {
      this.alive = false;
    }
  }
}

export class Rain {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.drops = [];
    this.animationId = null;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  addDrop(text, imageUrl) {
    if (this.drops.length >= MAX_DROPS) {
      const deadIndex = this.drops.findIndex(d => !d.alive);
      if (deadIndex !== -1) {
        this.drops.splice(deadIndex, 1);
      } else {
        this.drops.shift();
      }
    }
    this.drops.push(new Drop(text, this.width, this.height, imageUrl));
  }

  start() {
    const loop = () => {
      this.update();
      this.draw();
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
      this.drops[i].update(this.height);
      if (!this.drops[i].alive) {
        this.drops.splice(i, 1);
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.textBaseline = 'top';
    for (const drop of this.drops) {
      if (drop.opacity <= 0) continue;
      const [r, g, b] = drop.color;
      const fontStr = `${drop.fontStyle} ${drop.fontWeight} ${drop.fontSize}px ${drop.font}`;
      ctx.font = fontStr;

      let textY = drop.y;

      // Draw image if available
      if (drop.imageLoaded && drop.image) {
        ctx.globalAlpha = drop.opacity;
        ctx.drawImage(drop.image, drop.x, drop.y, drop.imageWidth, drop.imageHeight);
        ctx.globalAlpha = 1;
        textY = drop.y + drop.imageHeight + 10;
      }

      if (!drop.text) continue;

      // Lazy-compute wrapped lines
      if (!drop.wrappedLines) {
        ctx.font = fontStr;
        drop.wrappedLines = wrapTextInShape(ctx, drop.text, drop.shape, drop.wrapWidth, drop.fontSize * 1.3);
      }

      const lineHeight = drop.fontSize * 1.3;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${drop.opacity})`;

      for (let i = 0; i < drop.wrappedLines.length; i++) {
        const line = drop.wrappedLines[i];
        // Center each line within the shape width
        const lineWidth = ctx.measureText(line.text).width;
        const offsetX = (line.maxWidth - lineWidth) / 2;
        const centerOffset = (drop.wrapWidth - line.maxWidth) / 2;
        ctx.fillText(line.text, drop.x + centerOffset + offsetX, textY + i * lineHeight);
      }
    }
  }

  destroy() {
    this.stop();
    this.drops = [];
  }
}
