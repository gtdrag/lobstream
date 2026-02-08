const MAX_DROPS = 250;
const MAX_TEXT_LENGTH = 120;
const FONT_FAMILY = 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace';

class Drop {
  constructor(text, canvasWidth, canvasHeight) {
    this.text = text.length > MAX_TEXT_LENGTH
      ? text.slice(0, MAX_TEXT_LENGTH) + '...'
      : text;
    this.fontSize = 12 + Math.random() * 4; // 12-16px
    this.x = Math.random() * (canvasWidth - 200) + 20;
    this.y = -20 - Math.random() * 300;
    this.speed = 0.06 + Math.random() * 0.14;
    this.drift = (Math.random() - 0.5) * 0.08;
    this.baseOpacity = 0.6 + Math.random() * 0.3;
    this.opacity = this.baseOpacity;
    this.alive = true;
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

  addDrop(text) {
    if (this.drops.length >= MAX_DROPS) {
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

    ctx.textBaseline = 'top';
    for (const drop of this.drops) {
      if (drop.opacity <= 0) continue;
      ctx.font = `${drop.fontSize}px ${FONT_FAMILY}`;
      ctx.fillStyle = `rgba(200, 210, 220, ${drop.opacity})`;
      ctx.fillText(drop.text, drop.x, drop.y);
    }
  }

  destroy() {
    this.stop();
    this.drops = [];
  }
}
