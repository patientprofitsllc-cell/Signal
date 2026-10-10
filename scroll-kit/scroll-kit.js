// scroll-kit: the scroll engine behind patientcreations.com, reusable for any site.
// No dependencies. ES module. Every rule here came from a real bug or a real slowdown on phones:
//
//   1. Scroll drives a target; the visible state eases toward it with frame-rate-independent damping
//      (1 - exp(-k * dt)), so it feels the same at 30, 60 or 120 Hz and never "jumps" on a slow frame.
//   2. Work runs only while the section is on screen (IntersectionObserver, reading the LAST entry of a
//      batch: a fast jump can deliver two at once, and the first one is stale).
//   3. The rAF loop stops itself once it has settled, and restarts on scroll/resize. Idle pages cost nothing.
//   4. Reduced motion: no easing, state snaps to the scroll position.
//   5. Only transform and opacity change per frame. Never animate CSS filters, blur, box-shadow or layout:
//      they re-run on every frame and drop phones to ~1 fps (measured: 1 frame/2.5 s -> 60 fps after the fix).
//   6. dt is clamped, so returning to a background tab doesn't fling the animation.

export const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Exponential approach that is independent of frame rate. k ~ 6 (soft) to 14 (snappy). */
export const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** Smoothstep: holds at both ends, for "pause on each keyframe" pacing. */
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

/**
 * A tall section whose content is position: sticky. Calls render(state) with eased progress 0..1 while
 * it is on screen. Returns { progress(), goTo(p), destroy() }.
 *
 *   scrollScene(document.querySelector('.story'), ({ p, raw, dt }) => { ... }, { damping: 10 })
 */
export function scrollScene(section, render, { damping = 10, epsilon = 1e-4, map = (p) => p } = {}) {
  let cur = 0, lastT = 0, raf = 0, inView = false;
  const span = () => Math.max(1, section.offsetHeight - innerHeight);
  const target = () => map(clamp01((scrollY - section.offsetTop) / span()));

  function frame(now) {
    raf = 0;
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 1 / 60; // rule 6
    lastT = now;
    const goal = target();
    cur = reduceMotion() ? goal : damp(cur, goal, damping, dt);    // rules 1 and 4
    if (Math.abs(goal - cur) < epsilon) cur = goal;
    try { render({ p: cur, raw: goal, dt }); } catch (e) { console.error(e); } // one bad frame never stops the scene
    if (inView && cur !== goal) raf = requestAnimationFrame(frame); // rule 3
    else lastT = 0;
  }
  const kick = () => { if (inView && !raf) raf = requestAnimationFrame(frame); };

  const io = new IntersectionObserver((es) => {
    inView = es[es.length - 1].isIntersecting; // rule 2
    // Leaving the screen (e.g. a jump past the section): settle on the final state instead of freezing mid-way
    if (!inView) { cancelAnimationFrame(raf); raf = 0; lastT = 0; cur = target(); try { render({ p: cur, raw: cur, dt: 0 }); } catch (e) { console.error(e); } }
    kick();
  });
  io.observe(section);
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick);
  cur = target();
  render({ p: cur, raw: cur, dt: 0 });

  return {
    progress: () => cur,
    /** Scroll so the scene reaches p (0..1). */
    goTo: (p) => scrollTo({ top: section.offsetTop + clamp01(p) * span() + 1, behavior: reduceMotion() ? 'auto' : 'smooth' }),
    destroy() { io.disconnect(); removeEventListener('scroll', kick); removeEventListener('resize', kick); cancelAnimationFrame(raf); },
  };
}

/**
 * The Business Cards carousel pattern: N items in a sticky section, scroll moves through them.
 * Sets --d (signed distance from centre) and --ad (absolute, capped) on each item; style with transforms
 * only. Items further than `interactive` from the centre get pointer-events: none and tabindex -1
 * (they are slivers, too small to tap). onChange(index) fires when the centred item changes.
 */
export function scrollCarousel(section, items, { onChange = () => {}, interactive = 1.5, hold = 0.06, damping = 12 } = {}) {
  const n = items.length;
  const focusables = items.map((el) => el.querySelector('button, a') || el);
  let last = -1;
  const scene = scrollScene(section, ({ p }) => {
    const cur = clamp01((p - hold) / (1 - 2 * hold)) * (n - 1); // first and last item hold for a moment
    items.forEach((el, i) => {
      const d = i - cur, ad = Math.abs(d), near = ad < interactive;
      el.style.setProperty('--d', d.toFixed(3));
      el.style.setProperty('--ad', Math.min(3, ad).toFixed(3));
      el.style.zIndex = String(100 - Math.round(ad * 10));
      el.style.visibility = ad > 3.5 ? 'hidden' : 'visible';
      el.style.pointerEvents = near ? '' : 'none';
      focusables[i].tabIndex = near ? 0 : -1;
      el.classList.toggle('active', ad < 0.5);
    });
    const idx = Math.round(cur);
    if (idx !== last) { last = idx; onChange(idx); }
  }, { damping });
  return { ...scene, index: () => last, goToItem: (i) => scene.goTo(hold + (i / (n - 1)) * (1 - 2 * hold)) };
}

/**
 * Keeps a WebGL (or any expensive) renderer at a steady frame rate: steps resolution down only after
 * ~3 s of sustained slowness, back up after ~2 s of headroom, ignores the first 3 s (shader warm-up).
 * Call tick(now) once per rendered frame; setRatio(r) is yours (e.g. renderer.setPixelRatio).
 */
export function resolutionGovernor(setRatio, { min = 0.7, max = Math.min(devicePixelRatio || 1, 2), slowMs = 22, fastMs = 14 } = {}) {
  let ratio = max, t0 = 0, last = 0, acc = 0, frames = 0, windowStart = 0, slow = 0, fast = 0;
  setRatio(ratio);
  return {
    ratio: () => ratio,
    tick(now) {
      if (!t0) t0 = now;
      if (last) { acc += now - last; frames++; }
      last = now;
      if (now - t0 < 3000) return;
      if (!windowStart) windowStart = now;
      if (now - windowStart < 1000 || !frames) return;
      const ms = acc / frames; acc = 0; frames = 0; windowStart = now;
      slow = ms > slowMs ? slow + 1 : 0;
      fast = ms < fastMs ? fast + 1 : 0;
      if (slow >= 3 && ratio > min) { ratio = Math.max(min, ratio * 0.88); slow = 0; }
      else if (fast >= 2 && ratio < max) { ratio = Math.min(max, ratio * 1.12); fast = 0; }
      else return;
      setRatio(ratio);
    },
    /** Call when the loop pauses (tab hidden, section off screen) so the gap isn't counted as a slow frame. */
    pause() { last = 0; },
  };
}
