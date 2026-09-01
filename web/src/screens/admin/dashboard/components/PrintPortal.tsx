import React from "react";
import { createPortal } from "react-dom";

interface Props {
  children: React.ReactNode;
}

export function PrintPortal({ children }: Props) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div id="tmv-print-portal" className="print-content">
      {children}
    </div>,
    document.body
  );
}

