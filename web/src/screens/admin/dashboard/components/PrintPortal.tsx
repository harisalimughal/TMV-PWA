import React from "react";
import { createPortal } from "react-dom";

interface Props {
  children: React.ReactNode;
}

export function PrintPortal({ children }: Props) {
  if (typeof document === "undefined") return null;

  return createPortal(
    // The print copy duplicates what is on screen; screen readers read the on-screen one.
    <div id="tmv-print-portal" className="print-content" aria-hidden="true">
      {children}
    </div>,
    document.body
  );
}

