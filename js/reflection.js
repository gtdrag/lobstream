const LOBSTER_SVG_PATH = 'assets/lobster.svg';
const BASE_OPACITY = 0.22;
const BREATHE_AMPLITUDE = 0.025;
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

    // Draw image at full alpha, then colorize it, then composite at desired opacity
    // Use offscreen canvas to colorize first
    if (!this._offscreen) {
      this._offscreen = document.createElement('canvas');
      this._offCtx = this._offscreen.getContext('2d');
    }
    this._offscreen.width = drawWidth;
    this._offscreen.height = drawHeight;
    const off = this._offCtx;

    // Draw the SVG at full opacity
    off.clearRect(0, 0, drawWidth, drawHeight);
    off.drawImage(this.image, 0, 0, drawWidth, drawHeight);

    // Replace color: fill red using source-atop (keeps shape, replaces color)
    off.globalCompositeOperation = 'source-atop';
    off.fillStyle = '#cc2244';
    off.fillRect(0, 0, drawWidth, drawHeight);
    off.globalCompositeOperation = 'source-over';

    // Now draw the colorized result onto the main canvas at breathing opacity
    ctx.globalAlpha = opacity;
    ctx.drawImage(this._offscreen, x, y);
    ctx.globalAlpha = 1;
  }

  destroy() {
    this.stop();
  }
}
