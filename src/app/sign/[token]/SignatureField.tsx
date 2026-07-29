"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  /** Called with a PNG data URL when the user draws, or null when cleared. */
  onChange?: (dataUrl: string | null) => void;
  /** Height of the pad in px. Default 220. */
  height?: number;
  /** Ink colour. Default #1a2238. */
  penColor?: string;
};

type Pt = { x: number; y: number; t: number };

/**
 * Smooth signature pad — no dependencies.
 *
 * Fixes the usual hand-rolled-canvas problems:
 *  - Quadratic-curve smoothing through stroke midpoints (no jagged/shaky lines)
 *  - Velocity-based line width, so it looks like ink rather than a marker
 *  - devicePixelRatio scaling (crisp, and tracks the finger exactly)
 *  - touch-action:none (the page can't scroll/zoom while you sign)
 *  - Redraws on resize instead of clearing
 */
export default function SignatureField({
  onChange,
  height = 220,
  penColor = "#1a2238",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Pt[][]>([]);   // completed strokes
  const current = useRef<Pt[]>([]);     // stroke in progress
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const ctxOf = (c: HTMLCanvasElement) => c.getContext("2d");

  /** Draw one stroke with midpoint quadratic smoothing + velocity-based width. */
  const drawStroke = useCallback(
    (ctx: CanvasRenderingContext2D, pts: Pt[]) => {
      if (pts.length < 2) {
        // A single tap — render a small dot so quick marks still show.
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, 1.4, 0, Math.PI * 2);
          ctx.fillStyle = penColor;
          ctx.fill();
        }
        return;
      }

      ctx.strokeStyle = penColor;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const cur = pts[i];

        // Velocity → width. Faster movement draws thinner, like a real pen.
        const dist = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        const dt = Math.max(cur.t - prev.t, 1);
        const velocity = dist / dt;
        const width = Math.max(0.9, Math.min(2.6, 2.6 - velocity * 1.6));

        // Curve through the midpoint of each pair — this is what removes the
        // jaggedness of connecting raw touch points with straight lines.
        const midX = (prev.x + cur.x) / 2;
        const midY = (prev.y + cur.y) / 2;
        const prevMidX = i > 1 ? (pts[i - 2].x + prev.x) / 2 : prev.x;
        const prevMidY = i > 1 ? (pts[i - 2].y + prev.y) / 2 : prev.y;

        ctx.beginPath();
        ctx.lineWidth = width;
        ctx.moveTo(prevMidX, prevMidY);
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        ctx.stroke();
      }
    },
    [penColor]
  );

  /** Repaint everything (used after resize). */
  const repaint = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c && ctxOf(c);
    if (!c || !ctx) return;
    const rect = c.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const s of strokes.current) drawStroke(ctx, s);
    if (current.current.length) drawStroke(ctx, current.current);
  }, [drawStroke]);

  /** Size the canvas for the device pixel ratio, then repaint. */
  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(rect.height * ratio);
    const ctx = ctxOf(c);
    ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
    repaint();
  }, [repaint]);

  const emit = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const empty = strokes.current.length === 0;
    setHasInk(!empty);
    onChange?.(empty ? null : c.toDataURL("image/png"));
  }, [onChange]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const point = (e: PointerEvent): Pt => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
    };

    const down = (e: PointerEvent) => {
      e.preventDefault();
      c.setPointerCapture?.(e.pointerId);
      drawing.current = true;
      current.current = [point(e)];
    };

    const move = (e: PointerEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const p = point(e);
      const last = current.current[current.current.length - 1];
      // Ignore micro-jitter: skip points that barely moved.
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.7) return;
      current.current.push(p);
      const ctx = ctxOf(c);
      if (ctx) drawStroke(ctx, current.current.slice(-3));
    };

    const up = (e: PointerEvent) => {
      if (!drawing.current) return;
      e.preventDefault?.();
      drawing.current = false;
      if (current.current.length) strokes.current.push(current.current);
      current.current = [];
      repaint();
      emit();
    };

    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    resize();

    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
    };
  }, [drawStroke, emit, repaint, resize]);

  const clear = () => {
    strokes.current = [];
    current.current = [];
    repaint();
    setHasInk(false);
    onChange?.(null);
  };

  return (
    <div className="sig-wrap">
      <style>{CSS}</style>
      <div className="sig-box">
        <canvas ref={canvasRef} className="sig-canvas" style={{ height }} />
        {!hasInk && <div className="sig-hint">Sign here with your finger</div>}
      </div>
      <div className="sig-actions">
        <button type="button" onClick={clear} className="sig-clear" disabled={!hasInk}>
          Start again
        </button>
        <span className="sig-status">{hasInk ? "Looks good ✓" : "Draw your signature above"}</span>
      </div>
    </div>
  );
}

const CSS = `
.sig-wrap{width:100%;}
.sig-box{position:relative;background:#fff;border:2px solid rgba(26,34,56,.15);border-radius:16px;overflow:hidden;}
.sig-canvas{display:block;width:100%;
  /* critical on mobile: stops the page scrolling/zooming while you draw */
  touch-action:none;-ms-touch-action:none;cursor:crosshair;}
.sig-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  pointer-events:none;color:rgba(26,34,56,.3);font-size:16px;font-weight:600;}
.sig-actions{display:flex;align-items:center;justify-content:space-between;margin-top:10px;gap:12px;}
.sig-clear{background:transparent;border:1.5px solid rgba(26,34,56,.2);color:#1a2238;font-weight:700;
  font-size:14px;padding:8px 16px;border-radius:30px;cursor:pointer;}
.sig-clear:disabled{opacity:.4;cursor:default;}
.sig-status{font-size:14px;font-weight:600;color:#075E45;}
`;
