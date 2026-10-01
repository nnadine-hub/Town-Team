/* ==========================================================================
   Town Team Home — Product viewer
   --------------------------------------------------------------------------
   Everything you may want to edit lives in the three config blocks below.

   productFrames  The rotation sequence. Each entry is either
                    • a string path (angles are spread evenly around 360°), or
                    • { src, angle, label } when the photographed angles are
                      uneven, as with the current 6-view set.
                  Add 24, 36 or 72 frames and the viewer adapts automatically.

   galleryItems   The thumbnail strip. `type: "angle"` turns the product to
                  that angle; `type: "still"` shows a separate photograph.

   VIEWER_CONFIG  Feel of the interaction.
   ========================================================================== */

const productFrames = [
  { src: "assets/product/frames/view-01-front.jpg",       angle: 0,   label: "Front" },
  { src: "assets/product/frames/view-02-front-left.jpg",  angle: 45,  label: "Front left" },
  { src: "assets/product/frames/view-03-left.jpg",        angle: 90,  label: "Left" },
  { src: "assets/product/frames/view-04-back.jpg",        angle: 180, label: "Back" },
  { src: "assets/product/frames/view-05-right.jpg",       angle: 270, label: "Right" },
  { src: "assets/product/frames/view-06-front-right.jpg", angle: 315, label: "Front right" },
];

const galleryItems = [
  { type: "still", src: "assets/product/gallery/hanger.jpg",   thumb: "assets/product/thumbs/hanger.jpg",   label: "On the hanger", alt: "Top with tie belt and wide-leg trousers hanging on wooden hangers" },
  { type: "angle", angle: 0, thumb: "assets/product/thumbs/front-photo.jpg", label: "Front, 360° view", badge: "360°" },
  { type: "still", src: "assets/product/gallery/flat-lay.jpg", thumb: "assets/product/thumbs/flat-lay.jpg", label: "Folded",        alt: "Top and trousers folded flat, showing the drawstring waist" },
];

const VIEWER_CONFIG = {
  degreesPerStageWidth: 300,  // dragging across the full viewer turns ~300°
  dragStartThreshold: 6,      // px before a gesture counts as a rotation
  inertiaFriction: 0.9,       // velocity kept per 16ms after release
  minInertiaVelocity: 0.03,   // deg/ms; below this, settle onto a frame
  velocitySampleMs: 90,
  snapDuration: 260,          // ms to settle on the nearest real frame
  jumpBaseDuration: 320,      // ms for programmatic turns...
  jumpMsPerDegree: 1.7,       // ...plus this much per degree travelled
  jumpMaxDuration: 1100,
  wheelSettleDelay: 140,      // ms after trackpad swipes before settling
  maxTickMarks: 36,           // hide per-frame notches beyond this count
};

/* ========================================================================== */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const el = {
    viewer: $("viewer"),
    stage: $("viewer-stage"),
    frames: $("viewer-frames"),
    still: $("viewer-still"),
    label: $("viewer-label"),
    loaderText: $("viewer-loader-text"),
    loaderProgress: $("viewer-loader-progress"),
    thumbs: $("thumbs-list"),
    rotation: $("rotation"),
    scrub: $("rotation-scrub"),
    ticks: $("rotation-ticks"),
    readout: $("rotation-readout"),
    stops: Array.from(document.querySelectorAll(".rotation__stop")),
  };

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- Angle helpers ---------- */

  const mod360 = (a) => ((a % 360) + 360) % 360;
  const shortestDelta = (from, to) => ((mod360(to) - mod360(from) + 540) % 360) - 180;
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  /* ---------- Frame model ---------- */

  function normaliseFrames(list) {
    const count = list.length;
    return list
      .map((item, i) => {
        const f = typeof item === "string" ? { src: item } : { ...item };
        f.angle = Number.isFinite(f.angle) ? mod360(f.angle) : (360 / count) * i;
        f.label = f.label || "";
        return f;
      })
      .sort((a, b) => a.angle - b.angle);
  }

  let frames = normaliseFrames(productFrames);

  function nearestFrameIndex(angle) {
    const a = mod360(angle);
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < frames.length; i++) {
      const d = Math.abs(shortestDelta(a, frames[i].angle));
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  /* ---------- State ---------- */

  const state = {
    ready: false,
    mode: "spin",          // "spin" | "still"
    angle: 0,              // unbounded, in degrees
    frameIndex: -1,
    activeGallery: 0,
    interacted: false,
    drag: null,
    motion: null,          // { type: "inertia" | "tween", ... }
    rafId: 0,
    wheelTimer: 0,
  };

  let frameImages = [];
  let thumbButtons = [];

  /* ---------- Build DOM ---------- */

  function buildFrames() {
    el.frames.textContent = "";
    frameImages = frames.map((f, i) => {
      const img = new Image();
      img.className = "viewer__frame";
      img.alt = f.label ? `Product, ${f.label.toLowerCase()} view` : `Product view ${i + 1}`;
      img.draggable = false;
      img.decoding = "async";
      img.dataset.index = String(i);
      el.frames.appendChild(img);
      return img;
    });
  }

  function buildTicks() {
    el.ticks.textContent = "";
    if (frames.length > VIEWER_CONFIG.maxTickMarks) return;
    frames.forEach((f) => {
      const tick = document.createElement("span");
      tick.className = "rotation__tick";
      tick.style.left = `${(f.angle / 360) * 100}%`;
      el.ticks.appendChild(tick);
    });
  }

  function buildThumbs() {
    el.thumbs.textContent = "";
    el.thumbs.style.setProperty("--thumb-count-actual", galleryItems.length);

    thumbButtons = galleryItems.map((item, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "thumb";
      btn.setAttribute("aria-label", item.label);
      btn.setAttribute("aria-pressed", "false"); // synced from the current view on render
      btn.title = item.label;

      const img = document.createElement("img");
      img.src = item.thumb;
      img.alt = "";
      img.width = 120;
      img.height = 126;
      img.loading = i < 6 ? "eager" : "lazy";
      img.draggable = false;
      btn.appendChild(img);

      if (item.badge) {
        const badge = document.createElement("span");
        badge.className = "thumb__badge";
        badge.textContent = item.badge;
        badge.setAttribute("aria-hidden", "true");
        btn.appendChild(badge);
      }

      btn.addEventListener("click", () => selectGalleryItem(i));
      li.appendChild(btn);
      el.thumbs.appendChild(li);
      return btn;
    });
  }

  /* ---------- Preloading ---------- */

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(img));
      };
      img.onerror = () => reject(new Error(`Could not load ${src}`));
      img.src = src;
    });
  }

  function setLoaderProgress(done, total) {
    const circumference = 125.66;
    el.loaderProgress.style.strokeDashoffset = String(circumference * (1 - done / total));
    el.loaderText.textContent = `Loading views ${done} of ${total}`;
  }

  async function preloadFrames() {
    const total = frames.length;
    let done = 0;
    setLoaderProgress(0, total);

    const results = await Promise.all(
      frames.map((f, i) =>
        loadImage(f.src)
          .then(() => {
            frameImages[i].src = f.src;
            done += 1;
            setLoaderProgress(done, total);
            // Show the front as soon as it is available, behind the loader veil.
            if (i === nearestFrameIndex(0)) render(true);
            return true;
          })
          .catch((err) => {
            console.warn(err.message);
            done += 1;
            setLoaderProgress(done, total);
            return false;
          })
      )
    );

    // Drop any frames that failed so the turntable never shows a blank.
    const failed = results.map((ok, i) => (!ok ? i : -1)).filter((i) => i >= 0);
    if (failed.length) {
      failed.reverse().forEach((i) => {
        frameImages[i].remove();
        frameImages.splice(i, 1);
        frames.splice(i, 1);
      });
      frameImages.forEach((img, i) => (img.dataset.index = String(i)));
      buildTicks();
    }

    if (!frames.length) {
      el.viewer.dataset.state = "error";
      el.loaderText.textContent = "Product views couldn't load. Refresh the page to try again.";
      return;
    }

    state.ready = true;
    state.frameIndex = -1;
    el.viewer.dataset.state = "ready";
    el.loaderText.textContent = "Product views loaded";
    render(true);

    preloadStills();
  }

  function preloadStills() {
    const stills = galleryItems.filter((g) => g.type === "still").map((g) => g.src);
    const run = () => stills.forEach((src) => loadImage(src).catch(() => {}));
    if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 300);
  }

  /* ---------- Rendering ---------- */

  function requestRender() {
    if (state.rafId) return;
    state.rafId = requestAnimationFrame(() => {
      state.rafId = 0;
      render();
    });
  }

  function render(force = false) {
    const norm = mod360(state.angle);
    const idx = nearestFrameIndex(norm);

    if (force || idx !== state.frameIndex) {
      if (frameImages[state.frameIndex]) frameImages[state.frameIndex].classList.remove("is-active");
      if (frameImages[idx]) frameImages[idx].classList.add("is-active");
      state.frameIndex = idx;
      if (state.mode === "spin") updateLabel();
      syncAngleThumbs();
    }

    // Indicator follows the continuous angle so it feels connected to the hand.
    const shown = Math.round(norm) % 360;
    el.rotation.style.setProperty("--progress", (norm / 360).toFixed(4));
    el.readout.textContent = `${shown}°`;

    el.stops.forEach((stop) => {
      const a = Number(stop.dataset.angle);
      const near =
        a === 360 ? norm > 315 : a === 0 ? norm <= 45 : Math.abs(shortestDelta(norm, a)) <= 45;
      stop.classList.toggle("is-current", state.mode === "spin" && near && !(a === 0 && norm > 315));
    });

    const frame = frames[idx];
    el.stage.setAttribute("aria-valuenow", String(shown));
    el.stage.setAttribute(
      "aria-valuetext",
      frame && frame.label ? `${shown} degrees, ${frame.label.toLowerCase()}` : `${shown} degrees`
    );
  }

  function updateLabel() {
    const f = frames[state.frameIndex];
    el.label.textContent = f && f.label ? f.label : `${Math.round(mod360(state.angle))}°`;
  }

  /* ---------- Gallery ---------- */

  function setActiveThumb(index) {
    state.activeGallery = index;
    thumbButtons.forEach((b, i) => b.setAttribute("aria-pressed", i === index ? "true" : "false"));
  }

  // In spin mode, highlight whichever angle thumbnail matches the visible frame.
  function syncAngleThumbs() {
    if (state.mode !== "spin" || !frames[state.frameIndex]) return;
    const current = frames[state.frameIndex].angle;
    const match = galleryItems.findIndex(
      (g) => g.type === "angle" && Math.abs(shortestDelta(current, g.angle)) < 0.5
    );
    setActiveThumb(match);
  }

  function selectGalleryItem(index) {
    const item = galleryItems[index];
    if (!item) return;

    if (item.type === "angle") {
      if (!state.ready) return;
      enterSpinMode();
      turnTo(item.angle);
      return;
    }

    stopMotion();
    state.mode = "still";
    el.viewer.dataset.mode = "still";
    el.still.hidden = false;
    el.still.src = item.src;
    el.still.alt = item.alt || item.label;
    el.label.textContent = item.label;
    el.stage.setAttribute("aria-disabled", "true");
    el.rotation.classList.add("is-idle");
    setActiveThumb(index);
  }

  function enterSpinMode() {
    if (state.mode === "spin") return;
    state.mode = "spin";
    el.viewer.dataset.mode = "spin";
    el.stage.removeAttribute("aria-disabled");
    el.rotation.classList.remove("is-idle");
    updateLabel();
    syncAngleThumbs();
    render(true);
  }

  /* ---------- Motion: tweens, inertia, snapping ---------- */

  function stopMotion() {
    state.motion = null;
  }

  function runMotion() {
    const step = (now) => {
      const m = state.motion;
      if (!m) return;

      if (m.type === "tween") {
        const t = Math.min(1, (now - m.start) / m.duration);
        state.angle = m.from + m.delta * m.ease(t);
        render();
        if (t < 1) requestAnimationFrame(step);
        else {
          state.angle = Math.round(mod360(m.from + m.delta) * 1000) / 1000;
          state.motion = null;
          render();
        }
        return;
      }

      if (m.type === "inertia") {
        const dt = Math.min(48, now - m.last);
        m.last = now;
        state.angle += m.velocity * dt;
        m.velocity *= Math.pow(VIEWER_CONFIG.inertiaFriction, dt / 16);
        render();
        if (Math.abs(m.velocity) > VIEWER_CONFIG.minInertiaVelocity) requestAnimationFrame(step);
        else {
          state.motion = null;
          settle();
        }
      }
    };
    requestAnimationFrame(step);
  }

  function tweenBy(delta, duration, ease = easeInOutCubic) {
    if (Math.abs(delta) < 0.01) {
      render();
      return;
    }
    if (prefersReducedMotion.matches || duration <= 0) {
      state.angle = mod360(state.angle + delta);
      render();
      return;
    }
    state.motion = { type: "tween", from: state.angle, delta, duration, ease, start: performance.now() };
    runMotion();
  }

  // Settle on the closest real photograph so the indicator matches the view.
  function settle() {
    const idx = nearestFrameIndex(state.angle);
    const delta = shortestDelta(state.angle, frames[idx].angle);
    tweenBy(delta, VIEWER_CONFIG.snapDuration, easeOutCubic);
  }

  // Programmatic turn; 360 means "one full turn forward".
  function turnTo(target) {
    if (!state.ready) return;
    stopMotion();
    const norm = mod360(state.angle);
    const delta = target >= 360 ? 360 - norm || 360 : shortestDelta(norm, target);
    const duration = Math.min(
      VIEWER_CONFIG.jumpMaxDuration,
      VIEWER_CONFIG.jumpBaseDuration + Math.abs(delta) * VIEWER_CONFIG.jumpMsPerDegree
    );
    state.angle = norm;
    tweenBy(delta, duration);
  }

  function startInertia(velocity) {
    if (prefersReducedMotion.matches || Math.abs(velocity) < VIEWER_CONFIG.minInertiaVelocity) {
      settle();
      return;
    }
    state.motion = { type: "inertia", velocity, last: performance.now() };
    runMotion();
  }

  function markInteracted() {
    if (state.interacted) return;
    state.interacted = true;
    el.viewer.classList.add("has-interacted");
  }

  /* ---------- Pointer input (mouse, pen, touch) ---------- */

  const degreesPerPixel = () =>
    VIEWER_CONFIG.degreesPerStageWidth / Math.max(1, el.stage.clientWidth);

  function onPointerDown(e) {
    if (!state.ready) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (state.drag) return; // ignore a second finger
    state.returnFromStill = state.mode === "still";

    stopMotion();
    state.drag = {
      id: e.pointerId,
      type: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      active: false,
      samples: [{ t: performance.now(), a: state.angle }],
    };

    if (e.pointerType === "mouse") {
      e.preventDefault(); // no text/image selection
      el.viewer.classList.add("is-dragging");
    }
    try { el.stage.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
  }

  function onPointerMove(e) {
    const d = state.drag;
    if (!d || e.pointerId !== d.id) return;

    if (!d.active) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) < VIEWER_CONFIG.dragStartThreshold) {
        // Mostly vertical touch: let the page scroll and forget this gesture.
        if (d.type !== "mouse" && Math.abs(dy) > VIEWER_CONFIG.dragStartThreshold) endDrag(e, false);
        return;
      }
      if (d.type !== "mouse" && Math.abs(dy) > Math.abs(dx)) {
        endDrag(e, false);
        return;
      }
      d.active = true;
      if (state.returnFromStill) enterSpinMode(); // a drag on a photo goes back to the 360° view
      el.viewer.classList.add("is-dragging");
      markInteracted();
    }

    const dx = e.clientX - d.lastX;
    d.lastX = e.clientX;
    state.angle -= dx * degreesPerPixel(); // drag left → product turns to show its left side

    const now = performance.now();
    d.samples.push({ t: now, a: state.angle });
    while (d.samples.length > 2 && now - d.samples[0].t > VIEWER_CONFIG.velocitySampleMs) d.samples.shift();

    requestRender();
  }

  function endDrag(e, allowInertia) {
    const d = state.drag;
    if (!d || (e && e.pointerId !== d.id)) return;
    state.drag = null;
    el.viewer.classList.remove("is-dragging");
    try { el.stage.releasePointerCapture(d.id); } catch (_) { /* noop */ }

    if (!d.active) return;

    let velocity = 0;
    const s = d.samples;
    if (allowInertia && s.length > 1) {
      const first = s[0];
      const last = s[s.length - 1];
      const dt = last.t - first.t;
      // Ignore stale samples: a pause before release means "stop here".
      if (dt > 0 && performance.now() - last.t < 60) velocity = (last.a - first.a) / dt;
    }
    startInertia(velocity);
  }

  el.stage.addEventListener("pointerdown", onPointerDown);
  el.stage.addEventListener("pointermove", onPointerMove);
  el.stage.addEventListener("pointerup", (e) => endDrag(e, true));
  el.stage.addEventListener("pointercancel", (e) => endDrag(e, false)); // browser took over (e.g. vertical scroll)
  el.stage.addEventListener("lostpointercapture", (e) => endDrag(e, false));
  el.stage.addEventListener("dragstart", (e) => e.preventDefault());
  el.stage.addEventListener("contextmenu", (e) => { if (state.drag && state.drag.active) e.preventDefault(); });

  // Horizontal trackpad swipes also turn the product; vertical wheel still scrolls.
  el.stage.addEventListener(
    "wheel",
    (e) => {
      if (!state.ready || state.mode !== "spin") return;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      stopMotion();
      markInteracted();
      state.angle += e.deltaX * degreesPerPixel() * 0.6;
      requestRender();
      clearTimeout(state.wheelTimer);
      state.wheelTimer = setTimeout(settle, VIEWER_CONFIG.wheelSettleDelay);
    },
    { passive: false }
  );

  /* ---------- Keyboard ---------- */

  function stepFrame(direction) {
    // If a turn is already animating, step from where it is heading, so
    // repeated key presses advance one view each instead of repeating.
    const m = state.motion;
    const base = m && m.type === "tween" ? m.from + m.delta : state.angle;
    const idx = nearestFrameIndex(base);
    const next = frames[(idx + direction + frames.length) % frames.length];
    let delta = shortestDelta(state.angle, next.angle);
    // With only two frames the shortest path is ambiguous; respect direction.
    if (Math.sign(delta) !== direction && Math.abs(delta) > 0.5) delta += direction * 360;
    stopMotion();
    tweenBy(delta, VIEWER_CONFIG.jumpBaseDuration);
  }

  el.stage.addEventListener("keydown", (e) => {
    if (!state.ready || state.mode !== "spin") return;
    const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    if (e.key in map) {
      e.preventDefault();
      markInteracted();
      stepFrame(map[e.key]);
    } else if (e.key === "Home") {
      e.preventDefault();
      turnTo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      turnTo(180);
    }
  });

  /* ---------- Draggable degree bar ---------- */

  let scrub = null;

  function angleFromScrub(clientX) {
    const r = el.scrub.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
    return Math.min(ratio, 0.9999) * 360;
  }

  el.scrub.addEventListener("pointerdown", (e) => {
    if (!state.ready) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    scrub = { id: e.pointerId, type: e.pointerType, startX: e.clientX, startY: e.clientY, active: e.pointerType === "mouse" };
    if (e.pointerType === "mouse") {
      e.preventDefault();
      beginScrub(e.clientX);
    }
    try { el.scrub.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
  });

  function beginScrub(clientX) {
    scrub.active = true;
    enterSpinMode();
    stopMotion();
    markInteracted();
    el.scrub.classList.add("is-scrubbing");
    state.angle = angleFromScrub(clientX);
    requestRender();
  }

  el.scrub.addEventListener("pointermove", (e) => {
    if (!scrub || e.pointerId !== scrub.id) return;
    if (!scrub.active) {
      const dx = Math.abs(e.clientX - scrub.startX);
      const dy = Math.abs(e.clientY - scrub.startY);
      if (dy > dx && dy > VIEWER_CONFIG.dragStartThreshold) { endScrub(e, false); return; }
      if (dx < VIEWER_CONFIG.dragStartThreshold) return;
      beginScrub(e.clientX);
    }
    state.angle = angleFromScrub(e.clientX);
    requestRender();
  });

  function endScrub(e, isTap) {
    if (!scrub || (e && e.pointerId !== scrub.id)) return;
    const s = scrub;
    scrub = null;
    el.scrub.classList.remove("is-scrubbing");
    try { el.scrub.releasePointerCapture(s.id); } catch (_) { /* noop */ }
    if (s.active) settle();
    else if (isTap && e) { beginScrub(e.clientX); el.scrub.classList.remove("is-scrubbing"); settle(); }
  }

  el.scrub.addEventListener("pointerup", (e) => endScrub(e, true));
  el.scrub.addEventListener("pointercancel", (e) => endScrub(e, false));
  el.scrub.addEventListener("dragstart", (e) => e.preventDefault());

  /* ---------- Indicator stops ---------- */

  el.stops.forEach((stop) => {
    stop.addEventListener("click", () => {
      if (!state.ready) return;
      enterSpinMode();
      markInteracted();
      turnTo(Number(stop.dataset.angle));
    });
  });

  /* ---------- Init ---------- */

  function init() {
    if (!frames.length) {
      el.viewer.dataset.state = "error";
      el.loaderText.textContent = "No product views have been added yet.";
      return;
    }
    buildFrames();
    buildTicks();
    buildThumbs();
    state.angle = frames[nearestFrameIndex(0)].angle;
    render(true);
    preloadFrames();
  }

  init();

  // Small debug/extension hook, e.g. productViewer.turnTo(180) from the console.
  window.productViewer = {
    turnTo: (deg) => { enterSpinMode(); turnTo(deg); },
    getAngle: () => mod360(state.angle),
    getFrame: () => frames[state.frameIndex],
    isReady: () => state.ready,
  };
})();
