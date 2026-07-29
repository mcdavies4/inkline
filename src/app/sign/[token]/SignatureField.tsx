"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import SignaturePad from "signature_pad";

type Props = {
  /** Called with a PNG data URL when the user has drawn something. */
  onChange?: (dataUrl: string | null) => void;
  /** Height of the pad in px. Default 220. */
  height?: number;
  /** Ink colour. Default near-black. */
  penColor?: string;
};

/**
 * Smooth, mobile-friendly signature pad.
 *
 * Fixes the usual hand-rolled-canvas problems:
 *  - Bezier smoothing (no jagged/shaky lines)
 *  - devicePixelRatio scaling (no lag or blur on retina/mobile)
 *  - touch-action:none (the page can't scroll/zoom while you sign)
 *  - correct resize handling (canvas doesn't clear or distort on rotate)
 */
export default function SignatureField({ onChange, height = 220, penColor = "#0B1F17" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // Size the canvas for the device pixel ratio so strokes are crisp and track
  // the finger exactly. Preserves any existing drawing across resizes.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas || !pad) return;

    const data = pad.toData();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    ctx?.scale(ratio, ratio);
    pad.clear();
    if (data?.length) pad.fromData(data);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePad(canvas, {
      penColor,
      backgroundColor: "rgba(255,255,255,0)", // transparent, so it stamps cleanly
      minWidth: 0.9,
      maxWidth: 2.6,
      velocityFilterWeight: 0.75, // smoother strokes
      throttle: 8, // ms between points — lower = more responsive
    });
    padRef.current = pad;

    const handleEnd = () => {
      const empty = pad.isEmpty();
      setHasInk(!empty);
      onChange?.(empty ? null : pad.toDataURL("image/png"));
    };
    pad.addEventListener("endStroke", handleEnd);

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);

    return () => {
      pad.removeEventListener("endStroke", handleEnd);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      pad.off();
    };
  }, [onChange, penColor, resize]);

  const clear = () => {
    padRef.current?.clear();
    setHasInk(false);
    onChange?.(null);
  };

  return (
    <div className="sig-wrap">
      <style>{CSS}</style>
      <div className="sig-box">
        <canvas ref={canvasRef} className="sig-canvas" style={{ height }} />
        {!hasInk && <div className="sig-hint">Sign here with your finger</div>}
        <div className="sig-baseline" />
      </div>
      <div className="sig-actions">
        <button type="button" onClick={clear} className="sig-clear" disabled={!hasInk}>
          Clear
        </button>
        <span className="sig-status">{hasInk ? "Looks good ✓" : "Draw your signature above"}</span>
      </div>
    </div>
  );
}

const CSS = `
.sig-wrap{width:100%;}
.sig-box{position:relative;background:#fff;border:2px solid rgba(11,31,23,.15);border-radius:16px;overflow:hidden;}
.sig-canvas{display:block;width:100%;
  /* critical on mobile: stops the page scrolling/zooming while drawing */
  touch-action:none;-ms-touch-action:none;cursor:crosshair;}
.sig-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  pointer-events:none;color:rgba(11,31,23,.32);font-size:16px;font-weight:600;}
.sig-baseline{position:absolute;left:24px;right:24px;bottom:38px;height:2px;background:rgba(11,31,23,.12);pointer-events:none;}
.sig-actions{display:flex;align-items:center;justify-content:space-between;margin-top:10px;gap:12px;}
.sig-clear{background:transparent;border:1.5px solid rgba(11,31,23,.2);color:#0B1F17;font-weight:700;
  font-size:14px;padding:8px 16px;border-radius:30px;cursor:pointer;}
.sig-clear:disabled{opacity:.4;cursor:default;}
.sig-status{font-size:14px;font-weight:600;color:#075E45;}
`;
