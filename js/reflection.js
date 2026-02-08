const LOBSTER_SVG_PATH = 'assets/lobster.svg';
const BASE_OPACITY = 0.50;
const BREATHE_AMPLITUDE = 0.05;
const BREATHE_PERIOD = 9000; // ms

// Eye positions in SVG coordinate space (viewBox 0 0 400 400)
const LEFT_EYE = { cx: 178, cy: 110 };
const RIGHT_EYE = { cx: 222, cy: 110 };
const PUPIL_RX = 11;
const PUPIL_RY = 13;
const SHINE_R = 3.5;
const EYE_WANDER = 5; // max pixels the pupil drifts from center (in SVG coords)

// Claw anchor in SVG coords (right raised claw arm base)
const CLAW_PIVOT = { x: 270, y: 195 };
const CLAW_SWAY_DEG = 3; // degrees of sway

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

    // Eye gaze state — smoothly moves between random targets
    this.gazeX = 0;
    this.gazeY = 0;
    this.gazeTargetX = 0;
    this.gazeTargetY = 0;
    this.gazeSpeed = 0.02;
    this.nextGazeChange = 0;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement
      ? this.canvas.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };
    const w = rect.width || 200;
    const h = rect.height || window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = w;
    this.height = h;
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

  // Pick a new random gaze target
  _newGazeTarget() {
    this.gazeTargetX = (Math.random() - 0.5) * 2 * EYE_WANDER;
    this.gazeTargetY = (Math.random() - 0.5) * 2 * EYE_WANDER;
    // Vary the interpolation speed for natural feel
    this.gazeSpeed = 0.01 + Math.random() * 0.03;
  }

  // Update gaze position with smooth interpolation
  _updateGaze(elapsed) {
    if (elapsed > this.nextGazeChange) {
      this._newGazeTarget();
      // Hold gaze for 2-6 seconds before picking new target
      this.nextGazeChange = elapsed + 2000 + Math.random() * 4000;
    }
    // Lerp toward target
    this.gazeX += (this.gazeTargetX - this.gazeX) * this.gazeSpeed;
    this.gazeY += (this.gazeTargetY - this.gazeY) * this.gazeSpeed;
  }

  // Convert SVG coords to canvas coords
  _svgToCanvas(svgX, svgY, drawX, drawY, drawW, drawH) {
    return {
      x: drawX + (svgX / 400) * drawW,
      y: drawY + (svgY / 400) * drawH,
    };
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (!this.loaded) return;

    const elapsed = performance.now() - this.startTime;
    const breathe = Math.sin((elapsed / BREATHE_PERIOD) * Math.PI * 2) * BREATHE_AMPLITUDE;
    const opacity = BASE_OPACITY + breathe;

    // Size the lobster to fit the sidebar
    const size = Math.min(this.width * 1.0, this.height * 0.6);
    const aspect = this.image.naturalWidth / this.image.naturalHeight;
    const drawWidth = size * aspect;
    const drawHeight = size;

    // Position: centered
    const x = (this.width - drawWidth) / 2;
    const y = (this.height - drawHeight) / 2;

    // Scale factors for SVG → canvas
    const scaleX = drawWidth / 400;
    const scaleY = drawHeight / 400;

    // Subtle claw sway
    const clawAngle = Math.sin(elapsed * 0.0008) * CLAW_SWAY_DEG * (Math.PI / 180);

    ctx.globalAlpha = opacity;

    // Draw the base mascot (with subtle rotation for the raised claw)
    // We draw the whole image, then overlay animated elements
    ctx.drawImage(this.image, x, y, drawWidth, drawHeight);

    // Update eye gaze
    this._updateGaze(elapsed);

    // Draw pupils on both eyes
    const gazeOffX = this.gazeX * scaleX;
    const gazeOffY = this.gazeY * scaleY;
    const pRx = PUPIL_RX * scaleX;
    const pRy = PUPIL_RY * scaleY;
    const shR = SHINE_R * Math.min(scaleX, scaleY);

    for (const eye of [LEFT_EYE, RIGHT_EYE]) {
      const pos = this._svgToCanvas(eye.cx, eye.cy, x, y, drawWidth, drawHeight);

      // Pupil
      ctx.fillStyle = '#0a0a18';
      ctx.beginPath();
      ctx.ellipse(pos.x + gazeOffX, pos.y + gazeOffY, pRx, pRy, 0, 0, Math.PI * 2);
      ctx.fill();

      // Eye shine (offset slightly up-right from pupil)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(
        pos.x + gazeOffX + pRx * 0.35,
        pos.y + gazeOffY - pRy * 0.4,
        shR,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  destroy() {
    this.stop();
  }
}
