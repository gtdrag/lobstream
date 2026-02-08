const MAX_DROPS = 150;
const MAX_TEXT_LENGTH = 80;
const WATERLINE = 0.85;
const FADE_ZONE_START = 0.70;
const FONT_FAMILY = 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace';

class Drop {
  constructor(text, canvasWidth, canvasHeight) {
    this.text = text.length > MAX_TEXT_LENGTH
      ? text.slice(0, MAX_TEXT_LENGTH) + '...'
      : text;
    this.fontSize = 11 + Math.random() * 3; // 11-14px
    this.x = Math.random() * (canvasWidth - 200) + 20;
    this.y = -20 - Math.random() * 60;
    this.speed = 0.06 + Math.random() * 0.14;
    this.drift = (Math.random() - 0.5) * 0.08;
    this.baseOpacity = 0.5 + Math.random() * 0.3;
    this.opacity = this.baseOpacity;
    this.alive = true;
  }

  update(canvasHeight) {
    this.y += this.speed;
    this.x += this.drift;

    const normalizedY = this.y / canvasHeight;

    if (normalizedY > FADE_ZONE_START) {
      const fadeProgress = (normalizedY - FADE_ZONE_START) / (1.0 - FADE_ZONE_START);
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

  addDrop(text) {
    if (this.drops.length >= MAX_DROPS) {
      // Remove the oldest dead drop, or the oldest one
      const deadIndex = this.drops.findIndex(d => !d.alive);
      if (deadIndex !== -1) {
        this.drops.splice(deadIndex, 1);
      } else {
        this.drops.shift();
      }
    }
    this.drops.push(new Drop(text, this.width, this.height));
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

    // Draw waterline glow
    this.drawWaterline(ctx);

    // Draw drops
    ctx.textBaseline = 'top';
    for (const drop of this.drops) {
      if (drop.opacity <= 0) continue;
      ctx.font = `${drop.fontSize}px ${FONT_FAMILY}`;
      ctx.fillStyle = `rgba(180, 195, 210, ${drop.opacity})`;
      ctx.fillText(drop.text, drop.x, drop.y);
    }
  }

  drawWaterline(ctx) {
    const waterY = this.height * WATERLINE;
    const gradient = ctx.createLinearGradient(0, waterY - 2, 0, waterY + 2);
    gradient.addColorStop(0, 'rgba(100, 140, 180, 0)');
    gradient.addColorStop(0.5, 'rgba(100, 140, 180, 0.04)');
    gradient.addColorStop(1, 'rgba(100, 140, 180, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, waterY - 2, this.width, 4);
  }

  destroy() {
    this.stop();
    this.drops = [];
  }
}
