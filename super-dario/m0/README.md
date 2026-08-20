# M0 — the latency spike

Half a day of work whose only job is to produce **one number**: how long it
takes from your wrists crossing the shoulder line to a pixel changing on screen.
There is no game here.

## Run it

```sh
./run.sh          # then open http://localhost:8000
```

`getUserMedia` requires a secure context; `localhost` qualifies, so a plain
static server is enough. The pose model (~6 MB) is fetched from a CDN on first
run and then cached by the browser.

Chrome or Edge recommended — Safari's `requestVideoFrameCallback` support is
patchier, and the page falls back to `requestAnimationFrame` there.

## Measuring

1. Stand ~6 ft back, waist up in frame. Hold still for the 3-second calibration.
2. Film **yourself and the screen together** on a phone at 240fps.
3. Jump ten times. Then, arm at rest, press <kbd>Space</kbd> ten times.
4. Count frames from your wrists crossing the shoulder line to the marker bar
   going white. Each frame at 240fps is 4.2 ms. Take the median of ten.

The keypress runs are the control. They measure browser and display latency
with no pose pipeline involved, so:

```
gesture median − keypress median = what the pose pipeline actually costs
```

The on-screen readouts measure the software portion only (inference + filter +
loop + render). They exclude camera exposure and display latency, which is why
the phone measurement is the number that decides the project.

## Verdict

| Median | Verdict |
|---|---|
| under 100 ms | Good. Proceed as planned |
| 100–180 ms | Workable. Coyote time and jump buffering become required, not optional |
| 180–250 ms | Marginal. Loosen the filter (sliders), cap inference at 30fps, re-measure |
| over 250 ms | Rethink. Gestures need to be slower and more deliberate, or the game slower to match |

## Also worth recording while you're here

- **Does release timing separate cleanly?** Watch whether your arms are still up
  when the flash fires. If arm-down timing is distinguishable, the hold model
  for variable jump height is viable later. If not, fixed height is permanent.
- **False positives.** Talk, gesture, scratch your head for two minutes without
  intending anything. Every spurious JUMP is a threshold that needs tightening.
- **Filter tuning.** Find the lowest `minCutoff` that still feels crisp; that is
  the smoothest setting you can afford.

## What's here

| File | |
|---|---|
| `src/landmarks.js` | Landmark indices, named. y grows downward |
| `src/filter.js` | One-Euro filter — smooths drift without adding lag to a flick |
| `src/calibration.js` | 3-second capture; every threshold is a multiple of your shoulder width |
| `src/gestures.js` | **Landmarks in, intent out.** Hysteresis, refractory period, confidence gating |
| `src/overlay.js` | Skeleton, framing box, the shoulder-line threshold drawn to scale |
| `src/main.js` | Camera, model, loop, latency instrumentation |

`gestures.js` emits the intent struct the plan specifies:

```js
{ jump, throw, lean, crouch, armAngleL, armAngleR, tracking }
```

Nothing downstream of that file ever sees a landmark. M1 consumes this same
struct, and the keyboard writes it too — which is why the whole game can be
built and tested with the camera unplugged.
