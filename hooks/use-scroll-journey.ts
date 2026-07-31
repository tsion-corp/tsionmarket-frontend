"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  copyOpacity,
  journeyFrame,
  journeyMetrics,
  revealShown,
  scrubTarget,
  WAYPOINTS,
  type JourneyMetrics,
} from "@/lib/landing/journey";

// The scroll engine for the landing film. Scroll and resize handlers only set
// a dirty flag; a single requestAnimationFrame loop paints when dirty, by
// mutating DOM styles and video currentTime imperatively — driving this
// through React state would re-render the tree 60 times a second. Every style
// write is compare-before-assign: redundant assignments on blur/filter layers
// cause visible jank.
//
// The engine finds its nodes by data attributes under the root it is given:
// [data-film-poster] / [data-film-amb] / [data-film-transit] for the film,
// [data-cp] layers with [data-r] reveal items for the copy, [data-track],
// [data-copy-stage], [data-rail] with [data-rail-dot] buttons, and
// [data-journey-footer]. It owns every one of those styles at runtime.

// Fixed-nav clearance the fit-to-frame scale preserves above and below a layer.
const NAV_SAFE_PX = 84;

export function useScrollJourney(rootRef: RefObject<HTMLDivElement | null>) {
  const metricsRef = useRef<JourneyMetrics | null>(null);

  // Smooth-scrolls to a waypoint's hold; used by the navbar, rail and footer.
  const go = useCallback((i: number) => {
    const starts = (metricsRef.current ?? journeyMetrics(window.innerHeight)).starts;
    window.scrollTo({ top: (starts[i] ?? 0) + 8, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const all = <T extends Element>(sel: string) => Array.from(root.querySelectorAll<T>(sel));
    const posters = all<HTMLDivElement>("[data-film-poster]");
    const ambients = all<HTMLVideoElement>("[data-film-amb]");
    const transits = all<HTMLVideoElement>("[data-film-transit]");
    const layers = all<HTMLDivElement>("[data-cp]");
    const items = layers.map((layer) =>
      Array.from(layer.querySelectorAll<HTMLElement>("[data-r]"))
    );
    const track = root.querySelector<HTMLDivElement>("[data-track]");
    const stage = root.querySelector<HTMLDivElement>("[data-copy-stage]");
    const rail = root.querySelector<HTMLElement>("[data-rail]");
    const railDots = all<HTMLButtonElement>("[data-rail-dot]");
    const footer = root.querySelector<HTMLElement>("[data-journey-footer]");

    // Capture each item's authored transform once, so a reveal restores its
    // own base (the centred scroll cue keeps its translateX) instead of
    // clearing it to none.
    for (const arr of items) {
      for (const it of arr) {
        const base = (it.style.transform || "").replace(/translateY\([^)]*\)/g, "").trim();
        it.dataset.rt = base || "none";
        it.dataset.rt0 = `${base} translateY(26px)`.trim();
      }
    }

    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reduceQuery.matches;

    let metrics = journeyMetrics(window.innerHeight);
    metricsRef.current = metrics;
    let dirty = true;
    let disposed = false;
    let raf = 0;

    // Preloading every clip up front would fight the page for bandwidth; the
    // paint warms only the neighbourhood of the current waypoint.
    const warmed = new Set<HTMLVideoElement>();
    const warm = (video: HTMLVideoElement | undefined) => {
      if (!video || warmed.has(video)) return;
      warmed.add(video);
      if (video.preload !== "auto") {
        video.preload = "auto";
        video.load();
      }
    };

    const setOpacity = (el: HTMLElement, value: string) => {
      if (el.style.opacity !== value) el.style.opacity = value;
    };

    // Copy layers are viewport-centred flex boxes with a fixed authored
    // height; on a short viewport that overflows both edges. Scaling a layer
    // about its own centre is the one operation that keeps the whole block in
    // frame and clear of the fixed nav at the same time.
    const fit = () => {
      const avail = Math.max(180, window.innerHeight - NAV_SAFE_PX * 2);
      for (const layer of layers) {
        layer.style.transform = "none";
        let top = Infinity;
        let bottom = -Infinity;
        for (const child of Array.from(layer.children)) {
          if (getComputedStyle(child).position === "absolute") continue;
          const r = child.getBoundingClientRect();
          if (r.height === 0) continue;
          top = Math.min(top, r.top);
          bottom = Math.max(bottom, r.bottom);
        }
        if (!isFinite(top)) continue;
        const h = bottom - top;
        const s = h > 0 ? Math.min(1, avail / h) : 1;
        layer.style.transformOrigin = "50% 50%";
        if (s < 0.995) layer.style.transform = `scale(${s.toFixed(4)})`;
      }
    };

    const measure = () => {
      metrics = journeyMetrics(window.innerHeight);
      metricsRef.current = metrics;
      if (track) track.style.height = `${metrics.trackHeight}px`;
      fit();
    };

    const paint = () => {
      const y = window.scrollY || 0;
      const frame = journeyFrame(y, metrics);
      const { i, inHold, p } = frame;

      // Reduced motion shows stills only, so warming clips that will never
      // display would waste exactly the bandwidth those users asked to save.
      if (!reduced) {
        warm(ambients[i]);
        warm(transits[i]);
        warm(ambients[i + 1]);
        warm(transits[i + 1]);
        if (i > 0) warm(transits[i - 1]);
      }

      // Film: the ambient loop plays during a hold; the transit clip is never
      // played — its currentTime is written straight from scroll progress.
      // Under prefers-reduced-motion the film is stills only: no loops, no
      // scrubbing, a poster cross-fade at the transit midpoint instead.
      for (let k = 0; k < WAYPOINTS; k++) {
        const a = ambients[k];
        const isAmb = !reduced && inHold && k === i;
        setOpacity(a, isAmb ? "1" : "0");
        if (isAmb) {
          if (a.paused) a.play().catch(() => {});
        } else if (!a.paused) {
          a.pause();
        }
        const posterOn = reduced
          ? inHold || p < 0.5
            ? k === i
            : k === i + 1
          : k === i && a.readyState < 2;
        setOpacity(posters[k], posterOn ? "1" : "0");
      }
      for (let k = 0; k < transits.length; k++) {
        const t = transits[k];
        const active = !reduced && !inHold && k === i;
        setOpacity(t, active ? "1" : "0");
        if (active) {
          if (!t.paused) t.pause();
          const target = scrubTarget(p, t.duration, t.currentTime);
          if (target != null) t.currentTime = target;
        }
      }

      // Copy: the active layer holds, then hands off to the next inside the
      // transit so the words move with the camera rather than after it.
      for (let k = 0; k < WAYPOINTS; k++) {
        const layer = layers[k];
        const o = copyOpacity(k, frame);
        setOpacity(layer, o.toFixed(3));
        const vis = o > 0.02 ? "visible" : "hidden";
        if (layer.style.visibility !== vis) layer.style.visibility = vis;
      }

      const applyItem = (it: HTMLElement, on: boolean) => {
        if (on) {
          if (it.dataset.on !== "1") {
            it.dataset.on = "1";
            it.style.opacity = "1";
            it.style.filter = "none";
            it.style.transform = it.dataset.rt || "none";
          }
        } else if (it.dataset.on === "1") {
          it.dataset.on = "0";
          it.style.opacity = "0";
          it.style.filter = "blur(8px)";
          it.style.transform = it.dataset.rt0 || "translateY(26px)";
        }
      };

      // Sequential reveal inside the active hold; reduced motion shows a
      // layer whole (the opacity cross-fade above still carries the change).
      const active = items[i] ?? [];
      for (let k = 0; k < active.length; k++) {
        applyItem(active[k], reduced || revealShown(k, active.length, frame, i));
      }
      // During a transit the incoming layer's fade-in must carry content, so
      // its lead item is shown while the camera moves; the remaining items
      // keep their stagger for the moment the hold begins. Without this the
      // handoff fades in an empty layer on a first forward pass.
      if (!inHold) {
        const incoming = items[i + 1] ?? [];
        for (let k = 0; k < incoming.length; k++) {
          applyItem(incoming[k], reduced || k === 0 || i + 1 === 0);
        }
      }
      // Layers ahead of the camera reset so they replay on the way back;
      // layers behind stay revealed.
      if (!reduced) {
        for (let k = 0; k < WAYPOINTS; k++) {
          if (k <= i + 1) continue;
          for (const it of items[k]) {
            if (it.dataset.on === "1") {
              it.dataset.on = "0";
              it.style.opacity = "0";
              it.style.filter = "blur(8px)";
              it.style.transform = it.dataset.rt0 || "translateY(26px)";
            }
          }
        }
      }

      // The fixed overlays hand the frame to the real footer instead of
      // sitting underneath it.
      if (footer && stage) {
        const vh = window.innerHeight;
        const ft = footer.getBoundingClientRect().top;
        const fade = Math.min(1, Math.max(0, (ft - vh * 0.4) / (vh * 0.5)));
        setOpacity(stage, fade.toFixed(3));
        const vis = fade > 0.02 ? "visible" : "hidden";
        if (stage.style.visibility !== vis) stage.style.visibility = vis;
        if (rail) {
          setOpacity(rail, fade.toFixed(3));
          // Faded-out buttons must not keep stealing clicks or tab stops
          // from the footer underneath them.
          if (rail.style.visibility !== vis) rail.style.visibility = vis;
        }
      }

      for (let k = 0; k < railDots.length; k++) {
        const btn = railDots[k];
        const on = k === i;
        const label = btn.querySelector<HTMLElement>("[data-rail-label]");
        const ind = btn.querySelector<HTMLElement>("[data-rail-ind]");
        if (label) setOpacity(label, on ? "1" : "0");
        if (ind) {
          const bg = on ? "#f4f4f4" : "rgba(244,244,244,0.3)";
          if (ind.style.background !== bg) ind.style.background = bg;
          const tr = on ? "scale(1.6)" : "scale(1)";
          if (ind.style.transform !== tr) ind.style.transform = tr;
        }
        const cur = on ? "true" : "false";
        if (btn.getAttribute("aria-current") !== cur) btn.setAttribute("aria-current", cur);
      }
    };

    const tick = () => {
      if (dirty) {
        dirty = false;
        paint();
      }
      raf = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      dirty = true;
    };
    const onResize = () => {
      measure();
      dirty = true;
    };
    const onReduceChange = () => {
      reduced = reduceQuery.matches;
      dirty = true;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    reduceQuery.addEventListener("change", onReduceChange);
    measure();
    // Web fonts change the fit measurement; refit once they resolve.
    document.fonts?.ready.then(() => {
      if (disposed) return;
      fit();
      dirty = true;
    });
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      reduceQuery.removeEventListener("change", onReduceChange);
      for (const v of [...ambients, ...transits]) v.pause();
    };
  }, [rootRef]);

  return go;
}
