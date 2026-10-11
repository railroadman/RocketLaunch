# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Requires Node.js 22.12+ and a WebGL 2 browser. Install with `--legacy-peer-deps` (as documented in README).

```powershell
npm install --legacy-peer-deps
npm run dev              # Vite dev server on http://127.0.0.1:5173/
npm run check            # tsc --noEmit (type check only)
npm test                 # vitest run (tests/ only)
npm run build            # tsc --noEmit && vite build -> dist/
npm run preview          # serves dist/ on 127.0.0.1 (default port 5174 in PLAN.md)
npm run test:e2e         # scripts/smoke.mjs, Playwright browser smoke
npm run test:landing-earth  # scripts/landing-earth.mjs, landing-point/ocean check
```

Single test: `npx vitest run -t "<test name substring>"` or `npx vitest run tests/physics.test.ts`.

The e2e scripts are not standalone: start `npm run dev` (or `npm run preview`) first. They read `BASE_URL` (default `http://127.0.0.1:5173/`) and look for a Chromium binary in `%LOCALAPPDATA%\ms-playwright`; if missing, run `npx playwright install chromium`. They write screenshots to `artifacts/`.

Do not open `index.html` via `file://`; the module Worker and assets need HTTP.

## Architecture

Interactive Three.js mission (Russian UI) with a precomputed physics solution. Big picture spans several files:

**Two-phase pipeline.** `src/main.ts` spawns `src/sim/worker.ts`, which runs `calculateMission()` once off the main thread and posts a `MissionData` object (`src/sim/types.ts`: sampled `frames`, `events`, `orbit`, landing metrics, `parameters`). The worker rejects results that fail sanity gates (landing error > 10 m, landing speed > 2 m/s, perigee < 280 km or apogee > 320 km); changing the mission model means keeping these gates consistent. Once received, the worker is terminated: all rendering and UI reads from this static data.

**Physics (`src/sim/`).** `physics.ts` holds constants, atmosphere, forces and RK4 integration in an Earth-centred inertial frame, plus `earthFixed`/`inertial` rotations and orbital elements. `mission.ts` holds `CONFIG`, `solveAscent()` (searches the ascent program to hit altitude, radial and orbital speed targets), boostback/landing guidance, and assembles `MissionData`. Numbers live in `mission.ts`; formulas live in `physics.ts`. HUD values such as fuel, dynamic pressure and drag are derived from this integration, not separate animations.

**Time model (`src/sim/player.ts`, `state.ts`).** Mission time runs from −30 s to `data.end`. `MissionPlayer` maps mission time to a 270 s "screen" clock (automatic cut): critical windows (separation, Kármán line, touchdown, deployment) play at 1× and the rest is compressed to fit. `convert()` is the piecewise mapping between the two clocks. `frameAt()` interpolates between sampled frames; always go through `interpolateVehicle`/`interpolateVector` in `state.ts`, because position and telemetry must be interpolated at the same time before Earth-fixed conversion (nearest-state lookup caused the landing offset bug recorded in PLAN.md).

**Rendering (`src/scene/`).** `scene.ts` `FlightScene` owns the Three.js renderer (logarithmic depth buffer, EffectComposer with bloom and related passes) and the camera director: it picks a shot per frame from mission time and events, with a manual free-orbit mode and vehicle overrides. Coordinates use a floating origin: `render()` moves `root` by the focus target and shifts camera state by the same offset when the origin changes, so keep this when adding world-space objects. `models.ts` builds geometry for rocket, pad and landing site; `shaders.ts` holds the volumetric plume/smoke ray-march and screen shaders; `plume.ts` maps atmospheric pressure to plume shape. Quality (`high|medium|low`) changes pixel ratio and effects through `setQuality`.

**UI and audio.** `ui.ts` builds the DOM shell and updates the HUD, scrubber, timeline and the "Данные и модель" dialog from `frame` and `scene` each tick. `audio.ts` synthesises engine noise and uses Web Speech for the countdown. `main.ts` is the only wiring point: its `requestAnimationFrame` loop calls `player.tick`, then `scene.render`, `audio.update`, `ui.update`. `window.flight` is exposed deliberately for smoke/e2e scripts; keep it working.

## Tests

`tests/physics.test.ts` (14 tests) covers atmosphere/drag, orbit recovery, landing, fuel, separation continuity, per-satellite orbits and player timing/seek. Its `beforeAll` runs the full `calculateMission()` (timeout 120 s), so the first run is slow. Regression tests pin landing point in Earth-fixed coordinates at fractional times and satellite/upper-stage coordinate sync at separation. Browser checks live in `scripts/` and are not part of `npm test`.

## Project notes

- `README.md` (Russian) is the user-facing spec: controls, scientific assumptions, and the source list. `PLAN.md` is the phase/progress log and must be updated after changes and verifications, per README.
- Assumptions are explicitly labelled as non-real telemetry; keep that disclaimer when changing numbers or wording in the science panel.
- Do not spawn separate agents without the user's explicit permission (per PLAN.md).
