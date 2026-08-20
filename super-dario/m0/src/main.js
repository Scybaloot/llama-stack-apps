import { FilesetResolver, PoseLandmarker }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/vision_bundle.mjs';
import { LandmarkFilter } from './filter.js';
import { TRACKED } from './landmarks.js';
import { Calibration } from './calibration.js';
import { GestureReader, IDLE_INTENT } from './gestures.js';
import { drawOverlay } from './overlay.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/' +
              'pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const $ = (id) => document.getElementById(id);
const video = $('cam');
const canvas = $('overlay');
const ctx = canvas.getContext('2d');

let landmarker = null;
const filter = new LandmarkFilter(TRACKED, { minCutoff: 1.5, beta: 0.02 });
let calibration = new Calibration();
let reader = new GestureReader();

let intent = { ...IDLE_INTENT };
let points = {};
let calProgress = 0;
let lastFrameTs = -1;
let prevTime = performance.now();
let running = false;

// ---------------------------------------------------------------- latency
// t0 = frame handed to JS,  t3 = the paint that shows the flash.
// pipelineMs = t3 - t0 covers inference + filter + loop + render.
//
// It does NOT include camera exposure or display latency, which is exactly why
// the 240fps phone measurement is the real number. On the same footage, compare
// gesture-to-flash against keypress-to-flash: the difference is the pose pipeline.
const stats = { inference: [], pipeline: [], keypress: [], fps: [] };
function push(k, v) { const a = stats[k]; a.push(v); if (a.length > 40) a.shift(); }
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

function flash(kind, t0, source) {
  const bar = $(kind === 'jump' ? 'flash-jump' : 'flash-throw');
  const lamp = $(kind === 'jump' ? 'lamp-jump' : 'lamp-throw');
  bar.classList.add('on');
  lamp.classList.add('lit');
  setTimeout(() => { bar.classList.remove('on'); lamp.classList.remove('lit'); }, 150);

  // Two frames out lands after the paint that shows the bar (±1 frame).
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const ms = performance.now() - t0;
    push(source === 'key' ? 'keypress' : 'pipeline', ms);
    log(kind.toUpperCase(), source, ms);
  }));
}

function log(what, source, ms) {
  const el = $('log');
  const row = document.createElement('div');
  row.className = 'row' + (source === 'key' ? ' key' : '');
  row.innerHTML =
    `<span class="w">${what}</span>` +
    `<span class="s">${source}</span>` +
    `<span class="v">${ms.toFixed(1)} ms</span>`;
  el.prepend(row);
  while (el.children.length > 12) el.lastChild.remove();
}

function paintStats() {
  const set = (id, v, unit = ' ms') =>
    $(id).textContent = v === null ? '—' : v.toFixed(1) + unit;
  set('s-inf', median(stats.inference));
  set('s-pipe', median(stats.pipeline));
  set('s-key', median(stats.keypress));
  set('s-fps', median(stats.fps), '');
  const p = median(stats.pipeline), k = median(stats.keypress);
  $('s-delta').textContent = (p !== null && k !== null) ? (p - k).toFixed(1) + ' ms' : '—';
  $('s-track').textContent = intent.tracking;
  $('s-track').className = 'v tag ' + intent.tracking;
  $('s-lean').textContent = intent.lean.toFixed(2);
  $('s-cal').textContent = calibration.done
    ? `${calibration.result.shoulderW.toFixed(3)} sw`
    : `${Math.round(calProgress * 100)}%`;
  if (calibration.done && calibration.result.tooFar) $('warn').hidden = false;
}

// ---------------------------------------------------------------- loop
function onFrame(_now, metadata) {
  if (!running) return;
  const t0 = performance.now();
  const dt = Math.max(1, t0 - prevTime) / 1000;
  prevTime = t0;
  push('fps', 1 / dt);

  let ts = metadata ? Math.round(metadata.mediaTime * 1000) : Math.round(t0);
  if (ts <= lastFrameTs) ts = lastFrameTs + 1;   // must strictly increase
  lastFrameTs = ts;

  let result = null;
  try {
    result = landmarker.detectForVideo(video, ts);
  } catch { /* a dropped frame is not worth killing the loop over */ }
  push('inference', performance.now() - t0);

  const raw = result?.landmarks?.[0];
  if (raw) {
    points = filter.apply(raw, dt);
    calProgress = calibration.feed(points, t0);
    intent = reader.read(points, calibration.result, t0);
    for (const ev of reader.events) flash(ev, t0, 'pose');
  } else {
    points = {};
    intent = { ...IDLE_INTENT, tracking: 'none' };
  }

  drawOverlay(ctx, canvas.width, canvas.height, points, calibration.result, intent,
              calibration.done ? null : calProgress);
  paintStats();
  scheduleFrame();
}

// requestVideoFrameCallback fires once per *camera* frame, which is what we
// want: no wasted inference on frames the camera has not produced. Browsers
// without it fall back to rAF.
function scheduleFrame() {
  if (!running) return;
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(onFrame);
  else requestAnimationFrame(() => onFrame(0, null));
}

// ---------------------------------------------------------------- boot
async function boot() {
  const status = $('status');
  try {
    status.textContent = 'requesting camera…';
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    const s = stream.getVideoTracks()[0].getSettings();
    $('s-res').textContent = `${s.width}×${s.height} @${Math.round(s.frameRate ?? 0)}`;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    status.textContent = 'loading pose model (~6 MB)…';
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    status.textContent = 'stand back, waist up in frame';
    $('start').hidden = true;
    running = true;
    if (!video.requestVideoFrameCallback) {
      status.textContent += ' · no requestVideoFrameCallback, using rAF';
    }
    scheduleFrame();
  } catch (err) {
    status.textContent = `failed: ${err.message}`;
    status.classList.add('bad');
    console.error(err);
  }
}

// ---------------------------------------------------------------- controls
$('start').addEventListener('click', boot);

$('recal').addEventListener('click', () => {
  calibration = new Calibration();
  reader = new GestureReader();
  calProgress = 0;
  $('warn').hidden = true;
});

$('clear').addEventListener('click', () => {
  stats.inference.length = stats.pipeline.length = 0;
  stats.keypress.length = stats.fps.length = 0;
  $('log').innerHTML = '';
});

// Keyboard writes the same intents — the control that separates display
// latency from pose latency, and the input M1 is built against.
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); flash('jump', performance.now(), 'key'); }
  if (e.code === 'KeyF') { e.preventDefault(); flash('throw', performance.now(), 'key'); }
});

for (const id of ['minCutoff', 'beta']) {
  $(id).addEventListener('input', () => {
    $(id + '-v').textContent = $(id).value;
    filter.retune({
      minCutoff: parseFloat($('minCutoff').value),
      beta: parseFloat($('beta').value),
    });
  });
}
