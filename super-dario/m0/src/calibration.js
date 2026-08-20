import { L, REQUIRED } from './landmarks.js';

// Three seconds of standing still, then every threshold downstream is expressed
// as a multiple of YOUR shoulder width. That is what makes the gestures work at
// two feet from the camera and at eight.

export const CALIBRATION_MS = 3000;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

export class Calibration {
  constructor() { this.reset(); }

  reset() {
    this.samples = [];
    this.startedAt = null;
    this.result = null;
  }

  get done() { return this.result !== null; }

  // Returns 0..1 progress. Bad frames don't count, so stepping out of frame
  // pauses calibration instead of poisoning it.
  feed(pts, now) {
    if (this.done) return 1;
    const usable = REQUIRED.every((i) => pts[i] && pts[i].v > 0.6);
    if (!usable) return this.startedAt ? this._progress(now) : 0;

    if (this.startedAt === null) this.startedAt = now;

    const sl = pts[L.SHOULDER_L], sr = pts[L.SHOULDER_R];
    this.samples.push({
      shoulderW: Math.hypot(sl.x - sr.x, sl.y - sr.y),
      shoulderY: (sl.y + sr.y) / 2,
      shoulderX: (sl.x + sr.x) / 2,
      headY: pts[L.NOSE] ? pts[L.NOSE].y : (sl.y + sr.y) / 2,
    });

    const p = this._progress(now);
    if (p >= 1) this._finish();
    return p;
  }

  _progress(now) {
    return Math.min(1, (now - this.startedAt) / CALIBRATION_MS);
  }

  _finish() {
    const w = median(this.samples.map((s) => s.shoulderW));
    this.result = {
      shoulderW: w,
      shoulderY: median(this.samples.map((s) => s.shoulderY)),
      centerX: median(this.samples.map((s) => s.shoulderX)),
      headY: median(this.samples.map((s) => s.headY)),
      // Distance sanity check — a very small shoulder width means the player
      // is too far back for the wrists to track reliably.
      tooFar: w < 0.10,
      samples: this.samples.length,
    };
    this.samples = [];
  }
}
