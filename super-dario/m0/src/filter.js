// One-Euro filter.
//
// A plain moving average would add enough delay to make jumps feel mushy —
// the reason we don't use one. One-Euro raises its cutoff as the signal speeds
// up, so slow drift is smoothed hard (no jitter while you stand still) while
// fast motion passes through with very little lag (a jump flick stays crisp).
//
// minCutoff  lower  = smoother when still, more lag
// beta       higher = less lag when moving fast, more jitter

function alpha(cutoffHz, dt) {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
}

class LowPass {
  constructor() { this.y = null; }
  filter(x, a) {
    this.y = this.y === null ? x : a * x + (1 - a) * this.y;
    return this.y;
  }
  get value() { return this.y; }
}

export class OneEuro {
  constructor(opts = {}) {
    this.minCutoff = opts.minCutoff ?? 1.5;
    this.beta = opts.beta ?? 0.02;
    this.dCutoff = opts.dCutoff ?? 1.0;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.prev = null;
  }
  filter(value, dt) {
    if (dt <= 0) dt = 1 / 60;
    const derivative = this.prev === null ? 0 : (value - this.prev) / dt;
    this.prev = value;
    const edx = this.dx.filter(derivative, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alpha(cutoff, dt));
  }
}

// One filter pair per landmark we care about.
export class LandmarkFilter {
  constructor(indices, opts) {
    this.opts = opts;
    this.f = new Map();
    for (const i of indices) {
      this.f.set(i, { x: new OneEuro(opts), y: new OneEuro(opts) });
    }
  }
  // Rebuild with new tuning (the M0 sliders) without losing which indices we track.
  retune(opts) {
    this.opts = opts;
    for (const i of [...this.f.keys()]) {
      this.f.set(i, { x: new OneEuro(opts), y: new OneEuro(opts) });
    }
  }
  apply(landmarks, dt) {
    const out = {};
    for (const [i, pair] of this.f) {
      const lm = landmarks[i];
      if (!lm) continue;
      out[i] = {
        x: pair.x.filter(lm.x, dt),
        y: pair.y.filter(lm.y, dt),
        v: lm.visibility ?? 1,
      };
    }
    return out;
  }
}
