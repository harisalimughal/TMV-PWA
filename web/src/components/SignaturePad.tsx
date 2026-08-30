import React, { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

interface SignaturePadProps {
  onChange?: (hasSignature: boolean) => void;
}

/** Plain canvas + pointer events -- no library. The pad is intentionally simple: one
 * continuous stroke tracker, no undo history, matching how little a "customer signs
 * here" pad needs to do. */
export const SignaturePad = React.forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { onChange },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasContent = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Backing store at devicePixelRatio so the signature isn't blurry/pixelated on a
    // retina phone screen, while CSS size stays fixed to the layout box.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0A1A2F";
    }
  }, []);

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    lastPoint.current = pointFromEvent(event);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !lastPoint.current) return;
    const point = pointFromEvent(event);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    if (!hasContent.current) {
      hasContent.current = true;
      setEmpty(false);
      onChange?.(true);
    }
  }

  function handlePointerUp() {
    drawing.current = false;
    lastPoint.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasContent.current = false;
    setEmpty(true);
    onChange?.(false);
  }

  React.useImperativeHandle(ref, () => ({
    isEmpty: () => !hasContent.current,
    clear,
    toBlob: () =>
      new Promise(resolve => {
        const canvas = canvasRef.current;
        if (!canvas) {
          resolve(null);
          return;
        }
        // White background baked in -- a transparent PNG signature looks broken when
        // viewed outside the app (e.g. in an email or the admin dashboard later).
        const flattened = document.createElement("canvas");
        flattened.width = canvas.width;
        flattened.height = canvas.height;
        const ctx = flattened.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, flattened.width, flattened.height);
        ctx.drawImage(canvas, 0, 0);
        flattened.toBlob(resolve, "image/png");
      })
  }));

  return (
    <div className="flex flex-col gap-2">
      <div className="relative rounded-xl bg-white border-2 border-dashed border-admin-line overflow-hidden touch-none" style={{ height: 200 }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-black/30">Customer signs here</span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        disabled={empty}
        className="self-end flex items-center gap-1.5 text-xs text-admin-muted hover:text-admin-ink disabled:opacity-30 px-2 py-1"
      >
        <Eraser className="w-3.5 h-3.5" />
        Clear
      </button>
    </div>
  );
});
