import { L, REQUIRED } from './landmarks.js';

// Landmarks in, intent out. Nothing downstream of this file ever sees a landmark.
//
// Thresholds are in units of calibrated shoulder width, so they are
// distance-invariant. Remember y grows downward.

const T = {
  // Jump: rising edge when both wrists cross above the shoulder line.
  JUMP_ON:  0.10,   // wrists this far ABOVE shoulder line to fire
  JUMP_OFF: 0.02,   // must fall back to here before it can fire again (hysteresis)

  // Throw: a wrist extended sideways, at roughly shoulder height.
  THROW_REACH:  0.55,  // horizontal distance from shoulder to wrist
  THROW_BAND:   0.30,  // vertical tolerance around the shoulder line
  THROW_COOLDOWN_MS: 250,

  CROUCH: 0.35,        // head drops this far below its calibrated height
  MIN_VISIBILITY: 0.5,
};

export const IDLE_INTENT = {
  jump: false, throw: false, lean: 0, crouch: false,
  armAngleL: 0, armAngleR: 0, tracking: 'none',
};

export class GestureReader {
  constructor() {
    this.jumpArmed = true;
    this.throwArmed = true;
    this.lastThrowAt = -Infinity;
    this.last = { ...IDLE_INTENT };
    this.events = [];   // rising edges seen this frame
  }

  read(pts, cal, now) {
    this.events = [];
    if (!cal) return { ...IDLE_INTENT, tracking: 'uncalibrated' };

    const worst = Math.min(...REQUIRED.map((i) => (pts[i] ? pts[i].v : 0)));
    if (worst < T.MIN_VISIBILITY) {
      // Confidence gating: freeze the last good intent rather than acting on a
      // bad frame, and never let a low-confidence frame trigger anything.
      return { ...this.last, jump: false, throw: false, tracking: 'lost' };
    }

    const w = cal.shoulderW;
    const sl = pts[L.SHOULDER_L], sr = pts[L.SHOULDER_R];
    const wl = pts[L.WRIST_L], wr = pts[L.WRIST_R];
    const shoulderY = (sl.y + sr.y) / 2;
    const shoulderX = (sl.x + sr.x) / 2;

    // --- Jump: both wrists above the line, edge-triggered ---
    const aboveL = (shoulderY - wl.y) / w;
    const aboveR = (shoulderY - wr.y) / w;
    const bothUp = aboveL > T.JUMP_ON && aboveR > T.JUMP_ON;
    const bothDown = aboveL < T.JUMP_OFF && aboveR < T.JUMP_OFF;

    let jump = false;
    if (bothUp && this.jumpArmed) {
      jump = true;
      this.jumpArmed = false;
      this.events.push('jump');
    } else if (bothDown) {
      this.jumpArmed = true;
    }

    // --- Throw: a wrist extended sideways near shoulder height ---
    // Jump wins ties: a fast arms-up can clip through the throw band on its way.
    const reach = (wrist, shoulder) => ({
      out: Math.abs(wrist.x - shoulder.x) / w,
      level: Math.abs(wrist.y - shoulderY) / w,
    });
    const rl = reach(wl, sl), rr = reach(wr, sr);
    const extended =
      (rl.out > T.THROW_REACH && rl.level < T.THROW_BAND) ||
      (rr.out > T.THROW_REACH && rr.level < T.THROW_BAND);

    let thrown = false;
    const cool = now - this.lastThrowAt < T.THROW_COOLDOWN_MS;
    if (extended && this.throwArmed && !cool && !bothUp && !jump) {
      thrown = true;
      this.throwArmed = false;
      this.lastThrowAt = now;
      this.events.push('throw');
    } else if (!extended) {
      this.throwArmed = true;
    }

    // --- Continuous signals (unused by M0, but the struct is the contract) ---
    const angle = (wrist, shoulder) =>
      Math.atan2(wrist.x - shoulder.x, shoulderY - wrist.y);

    const intent = {
      jump,
      throw: thrown,
      lean: (shoulderX - cal.centerX) / w,
      crouch: pts[L.NOSE] ? (pts[L.NOSE].y - cal.headY) / w > T.CROUCH : false,
      armAngleL: angle(wl, sl),
      armAngleR: angle(wr, sr),
      tracking: worst > 0.75 ? 'good' : 'weak',
    };
    this.last = intent;
    return intent;
  }
}

export { T as THRESHOLDS };
