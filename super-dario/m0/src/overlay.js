import { L, BONES, REQUIRED } from './landmarks.js';

// The instrument panel. In the game this shrinks to a corner PiP, but its job
// is the same: when a gesture does not register, show the player why.

export function drawOverlay(ctx, W, H, pts, cal, intent, calProgress) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1); // mirror to match the mirrored video

  const px = (p) => [p.x * W, p.y * H];
  const visible = (i) => pts[i] && pts[i].v > 0.5;

  // --- framing guide: where the player should stand ---
  const framed = REQUIRED.every(visible) && !(cal && cal.tooFar);
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = framed ? 'rgba(90,220,130,.85)' : 'rgba(240,120,90,.9)';
  ctx.strokeRect(W * 0.14, H * 0.06, W * 0.72, H * 0.88);
  ctx.setLineDash([]);

  // --- shoulder line: the threshold the jump is measured against ---
  if (cal && visible(L.SHOULDER_L) && visible(L.SHOULDER_R)) {
    const y = ((pts[L.SHOULDER_L].y + pts[L.SHOULDER_R].y) / 2) * H;
    const lift = 0.10 * cal.shoulderW * H; // JUMP_ON, drawn to scale
    ctx.strokeStyle = 'rgba(255,255,255,.30)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.strokeStyle = intent.jump ? '#fff' : 'rgba(92,148,252,.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, y - lift); ctx.lineTo(W, y - lift); ctx.stroke();
  }

  // --- skeleton ---
  ctx.lineWidth = 4;
  ctx.strokeStyle = intent.tracking === 'good' ? '#5C94FC' : '#F0B429';
  for (const [a, b] of BONES) {
    if (!visible(a) || !visible(b)) continue;
    ctx.beginPath();
    ctx.moveTo(...px(pts[a]));
    ctx.lineTo(...px(pts[b]));
    ctx.stroke();
  }
  for (const i of Object.keys(pts)) {
    const p = pts[i];
    if (p.v <= 0.5) continue;
    const isHand = +i === L.WRIST_L || +i === L.WRIST_R;
    ctx.fillStyle = isHand ? '#F0B429' : '#EDEFF3';
    ctx.beginPath();
    ctx.arc(p.x * W, p.y * H, isHand ? 7 : 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // --- calibration ring (not mirrored: it is UI, not body) ---
  if (calProgress !== null && calProgress < 1) {
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#EDEFF3';
    ctx.font = '600 22px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STAND STILL', W / 2, H / 2 - 34);
    ctx.strokeStyle = '#5C94FC';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2 + 18, 34, -Math.PI / 2, -Math.PI / 2 + calProgress * Math.PI * 2);
    ctx.stroke();
  }
}
