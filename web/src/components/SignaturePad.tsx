import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { cx } from "../ui";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

interface SignaturePadProps {
  onChange?: (hasSignature: boolean) => void;
  /** Shown inside the pad before anything is drawn. */
  placeholder?: string;
  /** Fill the parent's height instead of the default fixed 210px (used in the
   *  full-screen signature modal, where the canvas should be as large as fits). */
  fill?: boolean;
}

interface Point {
  x: number;
  y: number;
}

const STROKE_COLOR = "#0A1A2F";
const STROKE_WIDTH = 2.6;

/**
 * Plain canvas + pointer events, no library.
 *
 * Three fixes over the previous version, all of which produced a blank or offset
 * signature in the field:
 *
 *  1. Rotation. The canvas was sized once on mount with no resize listener. Customers
 *     naturally turn the phone landscape to sign -- the CSS box resized, the backing
 *     store didn't, and the ink landed several centimetres from the finger. A
 *     ResizeObserver now re-sizes and replays the strokes.
 *  2. Dots. `hasContent` was only set in pointermove, so a signature made of quick
 *     taps (initials, a dot on an "i") registered as empty and the submit silently
 *     did nothing. Pointerdown now commits a point.
 *  3. Interrupted strokes. There was no pointercancel handler, so a stroke broken by
 *     a system gesture or an incoming call left `drawing` stuck true and the next
 *     touch drew a line across the whole pad from wherever the last one ended.
 *
 * Strokes are kept as data (not just pixels) precisely so a resize can redraw them
 * rather than wiping what the customer already signed.
 */
export const SignaturePad = React.forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { onChange, placeholder = "Sign here", fill = false },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokes = useRef<Point[][]>([]);
  const active = useRef<Point[] | null>(null);
  const [empty, setEmpty] = useState(true);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Only resize the backing store when it actually changed -- assigning width/height
    // clears the canvas, so doing it unconditionally would wipe the signature on every
    // render.
    const wantW = Math.round(rect.width * ratio);
    const wantH = Math.round(rect.height * ratio);
    if (canvas.width !== wantW || canvas.height !== wantH) {
      canvas.width = wantW;
      canvas.height = wantH;
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = STROKE_COLOR;
    ctx.fillStyle = STROKE_COLOR;

    for (const stroke of strokes.current) {
      if (stroke.length === 1) {
        // A tap: draw a dot, otherwise it would vanish.
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, STROKE_WIDTH / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
      ctx.stroke();
    }
  }, []);

  useLayoutEffect(() => {
    redraw();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    const handle = () => redraw();
    window.addEventListener("orientationchange", handle);
    return () => window.removeEventListener("orientationchange", handle);
  }, [redraw]);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function commitFirstInk() {
    if (empty) {
      setEmpty(false);
      onChange?.(true);
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = [pointFrom(event)];
    strokes.current.push(active.current);
    commitFirstInk();
    redraw();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!active.current) return;
    event.preventDefault();
    active.current.push(pointFrom(event));
    redraw();
  }

  function endStroke() {
    active.current = null;
  }

  const clear = useCallback(() => {
    strokes.current = [];
    active.current = null;
    setEmpty(true);
    onChange?.(false);
    redraw();
  }, [onChange, redraw]);

  React.useImperativeHandle(
    ref,
    () => ({
      isEmpty: () => strokes.current.length === 0,
      clear,
      toBlob: () =>
        new Promise(resolve => {
          const canvas = canvasRef.current;
          if (!canvas || strokes.current.length === 0) {
            resolve(null);
            return;
          }
          // White background baked in -- a transparent PNG signature renders as an
          // invisible or black smear once it leaves the app (in an email, or on the
          // dashboard's printed job report).
          const flat = document.createElement("canvas");
          flat.width = canvas.width;
          flat.height = canvas.height;
          const ctx = flat.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, flat.width, flat.height);
          ctx.drawImage(canvas, 0, 0);
          flat.toBlob(resolve, "image/png");
        })
    }),
    [clear]
  );

  return (
    <div className={cx("flex flex-col gap-2", fill && "h-full min-h-0")}>
      <div
        ref={wrapRef}
        className={cx(
          // Always a white paper surface, in both themes — the customer signs on
          // white and the exported PNG is dark ink on white, so this must match.
          "relative overflow-hidden rounded-card border-2 border-dashed border-[#CBD5E1] bg-white touch-none",
          fill ? "min-h-0 flex-1" : "h-[210px]"
        )}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          role="img"
          aria-label={empty ? "Signature pad, empty" : "Signature pad, signed"}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
            <div className="mb-2 w-2/3 border-b border-[#CBD5E1]" />
            <span className="text-[15px] text-[#64748B]">{placeholder}</span>
            <span className="text-[12px] text-[#94A3B8]">Use your finger</span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        disabled={empty}
        className="flex items-center gap-1.5 self-end rounded-control px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors active:bg-surface-sunken disabled:opacity-30"
      >
        <Eraser className="h-4 w-4" />
        Clear
      </button>
    </div>
  );
});
