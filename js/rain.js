const MAX_DROPS = 4;
const MAX_TEXT_LENGTH = 160;
const IMG_MAX_SIZE = 120;

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

const STYLES = ['normal', 'italic'];
const WEIGHTS = ['300', '400', '500'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

class Drop {
  constructor(text, canvasWidth, canvasHeight, imageUrl) {
    this.text = text.length > MAX_TEXT_LENGTH
      ? text.slice(0, MAX_TEXT_LENGTH) + '...'
      : text;
    this.fontSize = 14 + Math.random() * 24; // 14-38px
    this.font = pick(FONTS);
    this.fontStyle = pick(STYLES);
    this.fontWeight = pick(WEIGHTS);
    this.color = pick(COLORS);
    this.x = 40 + Math.random() * (canvasWidth - 300);
    this.y = -30 - Math.random() * 100;
    this.speed = 0.03 + Math.random() * 0.07;
    this.drift = (Math.random() - 0.5) * 0.04;
    this.baseOpacity = 0.7 + Math.random() * 0.25;
    this.opacity = this.baseOpacity;
    this.alive = true;

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
      img.onerror = () => {
        // Skip image if it fails to load
      };
      img.src = imageUrl;
      this.image = img;
    }
  }

  update(canvasHeight) {
    this.y += this.speed;
    this.x += this.drift;

    // Fade out in the last 10% of screen
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

      // Draw image if available
      if (drop.imageLoaded && drop.image) {
        ctx.globalAlpha = drop.opacity;
        ctx.drawImage(drop.image, drop.x, drop.y, drop.imageWidth, drop.imageHeight);
        ctx.globalAlpha = 1;

        // Draw text below image
        if (drop.text) {
          ctx.font = `${drop.fontStyle} ${drop.fontWeight} ${drop.fontSize}px ${drop.font}`;
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${drop.opacity})`;
          ctx.fillText(drop.text, drop.x, drop.y + drop.imageHeight + 8);
        }
      } else {
        // Text only
        ctx.font = `${drop.fontStyle} ${drop.fontWeight} ${drop.fontSize}px ${drop.font}`;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${drop.opacity})`;
        ctx.fillText(drop.text, drop.x, drop.y);
      }
    }
  }

  destroy() {
    this.stop();
    this.drops = [];
  }
}
