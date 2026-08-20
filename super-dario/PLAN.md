# Super Dario Bros. — Project Plan

A webcam pose-controlled 8-bit side-scrolling platformer. You are Dario, running
"The Scaling Course." You control him by moving your body: raise your arms to
jump, punch your arms out to throw a Claude Code sprite.

Status: **plan only, nothing built yet.**

---

## 1. The central question: what does the camera view look like?

You asked whether the camera feed is composited into the scene, shown in a
separate panel, or hidden entirely. Three options:

**A. AR overlay** — your live camera feed is the level backdrop, or you're
keyed into the scene. Rejected. Your body lives in camera-space and the level
lives in game-space; there is no honest way to make your real knee land on a
virtual platform. This is a Kinect party game, not a Mario game.

**B. Side-scroller + webcam picture-in-picture.** Classic side view, small
camera panel in a corner.

**C. Side-scroller where the character *is* the mirror.** No separate feed —
Dario's limbs are continuously driven by your limbs. Your arms go up, his arms
go up, and the jump happens. Your arms punch out, his arms punch out, and the
projectile fires.

**Recommendation: C as the game, B as the instrument panel.**

This is the whole idea, and it's the instinct you already had. The character
being a live puppet of your body is what makes it feel like *you're* Dario
rather than you operating a remote control. The feedback loop is
proprioceptive: you don't look at a UI to learn whether the gesture registered,
you look at whether the little guy's arms are up.

But you still need the PiP, for one reason: when a gesture *doesn't* register,
the player needs to know why. The panel is small, sits in the corner, and shows
your silhouette with the tracked skeleton drawn over it, plus a framing guide
box. It answers "am I in frame, is it seeing me, is the room too dark" without
ever pulling focus. During development it's also your entire debugging surface.

So: full side-scrolling stage, Dario puppeted by your pose, small skeleton PiP
bottom-right, and a two-lamp gesture indicator (JUMP / THROW) that flashes on
the rising edge so you can see the system's read of you in real time.

---

## 2. The architecture decision that matters most

**Separate "pose → intent" from "intent → physics."** One module reads camera
frames and emits an intent, and nothing else:

```
{ jump: false, throw: false, lean: -0.2, crouch: false,
  armAngleL: 1.2, armAngleR: 1.1, tracking: 'good' }
```

The game reads that struct at 60Hz and never sees a landmark. Three things fall
out of this for free:

1. **Keyboard input is always live.** It writes the same struct. You can build
   and test the entire game with no camera attached, and anyone can play it
   without standing up.
2. **The game is testable.** Feed recorded intent traces, assert on outcomes.
3. **The pose model is swappable.** MediaPipe today, something else later,
   without touching game code.

Run the two on separate clocks. Pose inference goes on its own loop capped at
~30fps; the game runs a fixed 60Hz timestep and reads the most recent intent.
If inference stutters, the game keeps animating smoothly instead of hitching.

---

## 3. Gesture vocabulary (v1)

Everything is measured in units of **your own shoulder width**, captured during
calibration, so it works whether you're two feet or eight feet from the camera.

| Intent | Trigger | Character response |
|---|---|---|
| **Run** | Automatic — Dario always runs right | Run cycle |
| **Jump** | Rising edge: both wrists cross above the shoulder line | Arms shoot up, jump |
| **Throw** | Either wrist extends past its shoulder horizontally, at roughly shoulder height | Arms thrust forward. Before the power-up: animation plays, nothing fires. After: Claude Code sprite on a **fixed arc** |
| **Crouch** *(v1.5)* | Head drops below 0.85× calibrated standing height | Duck |
| **Speed** *(v1.5)* | Shoulder midpoint offset from calibrated center | Lean forward to sprint, back to slow |

**Why auto-run.** You said "you naturally are moving forward." Auto-run is the
right reading: continuous horizontal control from body position is jittery and
tiring, and it competes for the same body signal the jump needs. Locking the
run frees your arms to do the two things that matter. Lean-to-modulate-speed is
a good v1.5 addition once the core feels solid.

**Why jump is an edge, not a hold.** Holding your arms overhead is exhausting
inside of a minute. Jump fires on the *transition* into arms-up, and your arms
can come straight back down. This also means variable jump height has to come
from somewhere else — proposal: how *fast* your arms rise sets the jump
impulse. Flick up hard for a full jump, drift up for a hop. It reads as natural
and it's a single derivative you already have.

**Four signal-processing rules, or it will feel broken:**

- **Smoothing.** One-Euro filter on landmarks. Low-pass, but latency-aware —
  a plain moving average adds enough delay to make jumps feel mushy.
- **Hysteresis.** Dual thresholds. Fire when wrists pass 1.05× shoulder height,
  don't re-arm until they drop back under 0.95×. Prevents chatter at the
  boundary.
- **Refractory period.** Per-gesture cooldown (~250ms on throw) so one arm
  motion isn't read as four throws.
- **Confidence gating.** If landmark visibility drops below threshold, freeze
  the last good intent and surface "step back into frame" in the PiP. Never let
  a low-confidence frame trigger an action.

**Calibration.** Three seconds of standing still at the start of a run: capture
shoulder width, shoulder height, head height. Show a live countdown with the
skeleton overlay so the player knows it's working. Offer a "recalibrate" key,
and a seated profile for players who can't stand.

---

## 4. Latency changes the level design

A gesture-driven jump is 100–200ms slower than a keypress — model inference
plus filter delay plus your own body's travel time. That is not a bug to
optimize away; it's a constraint to design around. The course must be built for
a body, not for thumbs:

- Wide, forgiving landing platforms
- Slower scroll speed than Mario
- Generous coyote time (~150ms of grace after leaving a ledge)
- Jump buffering (~200ms — a jump registered just before landing still fires)
- Enemy contact costs a size tier, not a life
- Two checkpoints in a 90-second course

Design 1-1 to be *readable at a glance and hard to fail by accident.* The
challenge should come from performing the gesture, not from parsing the level.

---

## 5. Motifs

Theme: Dario runs through a datacenter world. Keeping enemies generic rather
than competitor-branded — which is where you landed too — is both funnier and
better for anything you might eventually share.

| Mario | Super Dario | Notes |
|---|---|---|
| Mario | **Dario** | 8-bit, blue sweater, dark curly hair. Deliberately not a red hat and overalls — the sweater reads as him anyway |
| Fireball | **Claude Code sprite** | Little terminal window with a blinking cursor. Fixed bouncing arc, no aiming. On hit: enemy poofs, "REFACTORED" pops up |
| Goomba | **Hallucination** | Wobbly mushroom, walks left, one-hit stomp. Kept as a mushroom per your call |
| Koopa | **Paperclip** | 8-bit paperclip with legs. Stomp it and it curls into a coil you can kick down the lane |
| Green pipe | **Server rack** | Same silhouette, same jump affordance, blinking LEDs. Enterable later for bonus rooms |
| Coin | **Token** | Collect 100 → extra life. Token arcs trail over the clouds |
| Fire flower | **Claude Code power-up** | Terminal-window pickup that *enables the throw gesture* |
| Super mushroom | **More compute** | GPU chip pickup, Dario grows |
| Star | **Constitutional shield** | Brief flashing invulnerability. Optional for v1 |
| Clouds | **Clouds** | Jumpable platforms with token arcs above |
| Flagpole | **DEPLOY flag** | End of course, score tally |

### The power-up is the tutorial

One gesture carries three meanings, sequenced by game state. Nothing is ever
explained.

| When | Arms out means | What the player sees |
|---|---|---|
| 0:00–0:32 | A throw that fails | The **full throw animation** — windup, arms punch out — and nothing comes out. Dario looks at his own empty hands |
| 0:32 | **A reach** | He stretches, catches the Claude Code item mid-air |
| 0:32–end | A throw that works | Identical motion, sprite fires |

**Why the failed throw plays the real animation.** A substitute animation (a
shrug, a head-shake) reads as *the game didn't understand you*. The full throw
with an empty result reads as *the game understood perfectly; Dario can't do it
yet*. The failure becomes the character's limitation rather than the system's —
diegetic, and funny instead of broken.

It also drills the motor pattern. Every failed attempt is a rep, so the first
real throw is actually the player's tenth throw and the first one that works.

**The gesture that fails is the gesture that fixes it.** Reaching out is how you
grab the power-up. The motion that's been failing for thirty seconds is the
motion that acquires the cure — a tighter loop than Mario's, where you simply
walk into the flower.

Three implementation notes, each of which the design breaks without:

- **The power-up cannot be on a cloud.** Arms-up and arms-out are mutually
  exclusive body positions, so "jump to it, then reach for it" is a hard combo
  thirty seconds into a first run. Float it at arm height on flat ground during
  a calm stretch.
- **Touching it must also work.** Fallback pickup on collision, so nobody runs
  past it and gets stuck without the ability. But give the reach version the
  full flourish — catch, freeze frame, chime — so reaching is clearly the right
  way without being the only way.
- **The confused beat has to diminish.** Full reaction on the first two
  attempts, a smaller one for the next few, then just the animation with no
  reaction. Twenty identical confused looks is grating.

**Safeguard:** light the HUD's THROW lamp even while the ability is locked.
Dario reacting already implies "input received," but the lamp makes it explicit.
No player should ever conclude their camera is broken when the game is only
saying *not yet*.

**Aerial throws still work,** and this is why the edge-triggered jump was the
right call. Arms drop back to neutral immediately after the flick, so you can
jump and *then* punch out mid-air. A hold-to-jump design would have made the two
gestures genuinely exclusive.

**One Dario, not brothers.** Single player. Two-player couch mode (two people in
frame, MediaPipe tracks both) is a genuinely easy stretch goal, but it's a
stretch goal.

---

## 6. World 1-1 — "The Scaling Course"

Roughly 80 seconds, one screen tall, scrolling right. Seven beats:

| # | Time | Beat | Teaches |
|---|---|---|---|
| 1 | 0–8s | **Calibration porch.** Flat ground, no hazards. "RAISE BOTH HANDS" → Dario hops | Jump, at zero risk |
| 2 | 8–20s | **First racks.** Two single server racks, wide landings | Jump timing |
| 3 | 20–32s | **First hallucination.** One enemy walking at you — stomp or jump over | Threat reading |
| 4 | 32–40s | **Claude Code power-up** floating at arm height on flat ground. Reach to catch it. "ARMS OUT!" Two enemies to practice on | Throw |
| 5 | 40–55s | **Pit + cloud chain.** Three clouds over a gap, token arc above | Consecutive jumps |
| 6 | 55–70s | **Paperclip pair + double rack.** The one real difficulty spike | Both gestures together |
| 7 | 70–80s | **DEPLOY flag.** Score tally, "RUN AGAIN?" | — |

Checkpoints after beats 3 and 5.

---

## 7. Tech stack

**Browser, no server.** Everything runs client-side; the camera feed never
leaves the machine, which is worth stating out loud on the title screen.

- **Pose:** MediaPipe Tasks Vision `PoseLandmarker`, GPU delegate, `VIDEO` mode.
  33 landmarks, 30–60fps on a laptop. (Alternative: TF.js MoveNet Lightning.)
- **Rendering:** hand-rolled Canvas2D, fixed timestep, AABB collision. A 2D
  platformer is well-trodden ground and the whole game is ~800 lines. Kaplay is
  the escape hatch if the camera work eats more time than expected.
- **Sprites as source code.** Pixel art authored as arrays of strings with a
  palette lookup, baked to offscreen canvases at load. No binary assets, fully
  diffable in git, trivially editable. 16×16 and 16×24.
- **Audio:** WebAudio square-wave blips generated in code. No asset licensing,
  correctly 8-bit.
- **Build:** Vite. `getUserMedia` needs a secure context — localhost is fine,
  but demoing from another device needs a cert or a tunnel.

**Repo layout:**

```
super-dario/
  index.html
  src/
    pose/      camera.js  landmarker.js  calibration.js  gestures.js  filter.js
    input/     intent.js  keyboard.js
    game/      loop.js  physics.js  entities.js  level-1-1.js  camera2d.js
    render/    sprites.js  draw.js  hud.js  pip.js
    audio/     blips.js
```

---

## 8. Milestones

| | Milestone | Days | Done when |
|---|---|---|---|
| **M0** | **Spike — go/no-go** | 0.5 | Webcam + landmarker + skeleton overlay, gestures logged to console. **Measure end-to-end latency here.** If it's unusable, the whole design changes |
| **M1** | Playable on keyboard | 2 | Full platformer, all of 1-1, arrows/space/F. No camera. This is a real game already |
| **M2** | Intent bus wired | 1 | Gestures drive the same intents. Both inputs live simultaneously |
| **M3** | Puppet rig | 1 | Dario's arms follow yours continuously, not just on trigger |
| **M4** | Art, audio, juice | 2 | Sprites, blips, screen shake, particles, "REFACTORED" popups |
| **M5** | Onboarding + tuning | 1.5 | Calibration screen, sensitivity slider, coach prompts. **Playtest with three people who have never seen it — this is the gate for whether cold-start onboarding is worth building** |
| **M6** | Polish | 1 | Title screen, score, restart flow |

~9 days of focused work. M0 and M1 are the ones that de-risk everything: M0
tells you whether the premise holds, and M1 gives you a game that's fun before
any camera is involved.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| **Latency makes jumps feel unfair** | Coyote time, jump buffering, forgiving level design. Measure at M0 before committing |
| **Arm fatigue** | Edge-triggered jump, 80-second course, sit-down keyboard mode always available |
| **Lighting and framing** | Framing guide box in the PiP, explicit "stand ~6ft back, waist up" on the title screen |
| **Laptop thermals** | Cap inference at 30fps, GPU delegate, decoupled loops |
| **Standing requirement** | Seated calibration profile; one-arm mode (either wrist above shoulder = jump) |
| **Gesture ambiguity** | A fast arms-up can clip through the throw zone. Tune thresholds so the throw band sits clearly below the jump band, and let jump win ties |

---

## 10. Ground rules

Two things worth settling before this goes anywhere beyond your laptop: draw
all sprites from scratch rather than lifting Nintendo assets, and check with
Dario before showing it publicly — an affectionate 8-bit caricature is a
different thing when it's shared than when it's a demo on your own machine.

---

## 11. Decisions

Settled, and now assumed throughout this document:

| | Decision | Consequence |
|---|---|---|
| **Scope** | One perfect 80-second course | The 9-day estimate holds. No second level; time goes into feel, not content |
| **Audience** | Build for an in-person demo first, harden later | Onboarding stays minimal for v1 — you are the onboarding. M5's playtest decides whether cold-start work is worth doing |
| **Enemy hit** | Poof + "REFACTORED" popup | Half a day. The convert-to-follower idea stays on the post-M6 list |
| **Throw** | Fixed arc, no aiming | Gesture stays binary and easy to detect. `armAngle` is still in the intent struct, so aiming costs nothing to revisit |

### The one question left is empirical

**Does variable jump height from arm-raise speed feel natural or twitchy?** This
isn't a design call — it's a measurement, and M0 answers it in an afternoon.
Log wrist velocity at the moment of the jump edge across a few dozen jumps and
look at the spread. If people cluster into two clean modes (flick vs. drift),
map it. If it's one smear, drop it and give every jump a fixed impulse.

### What "demo first" changes about the build

Because the target is a room with you in it, three things get deferred rather
than cut:

- **Camera-permission priming** — a cold-load user needs to be told why the
  browser is about to ask for their webcam. You can just say it out loud.
- **Framing and lighting tutorial** — replaced by you pointing at the floor and
  saying "stand about there."
- **Forgiving-threshold auto-tuning** — v1 can ship one sensitivity slider
  instead of adapting per body.

All three live behind the same M5 gate. If three strangers can play it without
coaching, harden it into a link. If they can't, the problem is the gestures, not
the onboarding — and that's worth knowing before spending four days on polish.
