import React, { useLayoutEffect, useRef, useState } from "react";
import "./reportDocument.css";

const A4_WIDTH = 210 * 96 / 25.4;
export function ReportPreviewCanvas({ children, zoom = 100 }: { children: React.ReactNode; zoom?: number }) {
  const host = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: A4_WIDTH, height: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const width = Math.min(host.current?.clientWidth || A4_WIDTH, A4_WIDTH);
      const height = content.current?.offsetHeight || 0;
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (host.current) observer?.observe(host.current);
    if (content.current) observer?.observe(content.current);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const scale = zoom / 100;
  return <div className="report-preview-canvas" ref={host}>
    <div className="report-preview-stage" style={{ width: size.width * scale, height: size.height ? size.height * scale : undefined }}>
      <div ref={content} className="report-preview-document" style={{ width: size.width, position: size.height ? "absolute" : "relative", top: 0, left: 0, transform: `scale(${scale})` }}>{children}</div>
    </div>
  </div>;
}
