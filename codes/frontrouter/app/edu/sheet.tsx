import { useEffect, useRef } from "react";

import { H, Ink, type Pt, type Scene, W } from "./ink";

/**
 * A step's scene on the page: a canvas kept at the sheet's shape, drawn every
 * frame, with touch, pen and mouse read in sheet units. One finger at a time,
 * so a smartboard with several hands on it does not jump.
 */
export function Sheet({ scene, label }: { scene: Scene; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const c = el?.getContext("2d");
    if (!el || !c) return;
    const g = new Ink(c);
    const start = performance.now();
    let frame = 0;
    let scale = 1;
    let held: number | null = null;

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth || W;
      el.width = Math.round(w * dpr);
      el.height = Math.round(((w * H) / W) * dpr);
      scale = el.width / W;
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);

    const draw = () => {
      g.begin(scale);
      scene.draw(g, (performance.now() - start) / 1000);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    const at = (e: PointerEvent): Pt => {
      const r = el.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    const down = (e: PointerEvent) => {
      if (held !== null) return;
      const p = at(e);
      g.pointer = p;
      const id = g.hit(p);
      if (id) {
        scene.press?.(id);
        return;
      }
      if (scene.down?.(p)) {
        held = e.pointerId;
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    };
    const move = (e: PointerEvent) => {
      if (held !== null && e.pointerId !== held) return;
      const p = at(e);
      g.pointer = p;
      if (held !== null) scene.move?.(p);
      el.style.cursor = held !== null || g.hit(p) ? "pointer" : "";
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== held) return;
      held = null;
      scene.up?.();
      // A finger lifted from a touch screen is no longer hovering.
      if (e.pointerType !== "mouse") g.pointer = null;
    };
    const away = () => {
      if (held === null) g.pointer = null;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", away);
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", away);
    };
  }, [scene]);

  return <canvas ref={canvas} className="edu-canvas" role="img" aria-label={label} />;
}
