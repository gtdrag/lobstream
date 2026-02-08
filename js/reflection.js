const LOBSTER_SVG_PATH = 'assets/lobster.svg';
const BASE_OPACITY = 0.045;
const BREATHE_AMPLITUDE = 0.01;
const BREATHE_PERIOD = 9000; // ms

export class Reflection {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.image = null;
    this.loaded = false;
    this.animationId = null;
    this.startTime = performance.now();
    this.resize();
    this.loadImage();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  loadImage() {
    this.image = new Image();
    this.image.onload = () => {
      this.loaded = true;
    };
    this.image.src = LOBSTER_SVG_PATH;
  }

  start() {
    const loop = () => {
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

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (!this.loaded) return;

    const elapsed = performance.now() - this.startTime;
    const breathe = Math.sin((elapsed / BREATHE_PERIOD) * Math.PI * 2) * BREATHE_AMPLITUDE;
    const opacity = BASE_OPACITY + breathe;

    // Size the lobster relative to viewport - about 30% of the smaller dimension
    const size = Math.min(this.width, this.height) * 0.30;
    const aspect = this.image.naturalWidth / this.image.naturalHeight;
    const drawWidth = size * aspect;
    const drawHeight = size;

    // Position: center-bottom, sitting at the waterline (85% of height)
    const x = (this.width - drawWidth) / 2;
    const waterlineY = this.height * 0.85;
    const y = waterlineY - drawHeight * 0.3; // Partially below waterline

    ctx.globalAlpha = opacity;

    // Apply a subtle red/blue color tint by drawing with composite operations
    // First draw the base image
    ctx.drawImage(this.image, x, y, drawWidth, drawHeight);

    // Overlay a very faint red-blue tint
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(160, 80, 100, 0.15)';
    ctx.fillRect(x, y, drawWidth, drawHeight);

    // Reset
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  destroy() {
    this.stop();
  }
}
