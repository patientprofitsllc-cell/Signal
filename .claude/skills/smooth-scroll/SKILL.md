---
name: smooth-scroll
description: Use for ANY website Patient Creations builds with scroll-driven motion (scroll storytelling, sticky sections, 3D/WebGL scenes tied to scroll, card carousels, parallax, Apple-style scrubbing). Gives the scroll engine and rules from patientcreations.com so every site scrolls as smoothly on phones as on desktop.
---

# Smooth scroll, the patientcreations.com standard

Every Patient Creations site with scroll motion starts from `scroll-kit/` in this repo:

- `scroll-kit/scroll-kit.js`: `scrollScene`, `scrollCarousel`, `resolutionGovernor`, `damp`, `smoothstep`
- `scroll-kit/scroll-kit.css`: sticky scene and carousel base styles
- `scroll-kit/demo.html`: a working example (serve the folder and open it)

Copy the two files into the new site; don't rewrite the engine. The reference build is `showcase/`, the patientcreations.com homepage.

## Rules (each one fixed a real bug or slowdown)

1. **Scroll sets a target; the state eases toward it.** Use `damp(cur, target, k, dt)`, i.e. `1 - exp(-k*dt)`, never a fixed `lerp(…, 0.1)`: that one runs twice as fast at 120 Hz and stutters at 30 Hz. Clamp `dt` to 0.1 s.
2. **Animate only `transform` and `opacity` per frame.** Never animate `filter`, `blur`, `drop-shadow`, `box-shadow`, `width`/`height`, `top`/`left`. Paint shadows once (`box-shadow` on a static element). Dim with an overlay's opacity, not `brightness()`. On patientcreations.com, per-frame filters dropped the card carousel to 1 frame every 2.5 s on iPhone; removing them gave 60 fps.
3. **Only work while on screen.** IntersectionObserver gates the loop; read the **last** entry (`es[es.length-1]`), because a fast jump batches two. Reading only the first kept the 3D world rendering behind the page.
4. **Settle when leaving.** If the section leaves the screen mid-animation (a jump past it), snap to the final state; otherwise it freezes half-done (`scrollScene` does this).
5. **Let the loop sleep.** Stop requesting frames once the state reaches the target; restart on `scroll`/`resize` (passive listeners).
6. **Respect reduced motion.** Snap to the target (no easing), drop decorative transitions and loops.
7. **WebGL:** cap the pixel ratio (≤2), use `resolutionGovernor` (steps down only after ~3 s of sustained slowness, ignores the first 3 s), pause the render when the canvas is off screen, handle `webglcontextlost`, and ship a static fallback when WebGL is missing.
8. **Touch:** anything tappable is at least 44×44 px; items that shrink to slivers (far carousel cards) get `pointer-events: none` and `tabindex=-1`, with dots or buttons to reach every item.
9. **Sticky sections:** height in `vh` (scroll length), content `position: sticky; height: 100svh`. Map the first and last ~6% of a carousel to "hold" so the ends rest. Keep total scroll before the first CTA short on phones, or add a skip link or sticky CTA.

## Verify before shipping

Measure, don't eyeball. With Playwright on an emulated iPhone (DPR 2–3) and desktop:
- count `requestAnimationFrame` callbacks over 2.5 s while scrolling each scroll section: aim for ~55+ on desktop. Swiftshader is CPU-only, so treat a sudden drop to single digits as a real bug, not emulator noise.
- check tap targets ≥ 40 px, no horizontal scroll, the reduced-motion and no-WebGL paths, and that the loop goes idle off screen.
`showcase/qa/run.cjs` is the full suite to copy (`QA_ONLY=<viewport>` runs one).
