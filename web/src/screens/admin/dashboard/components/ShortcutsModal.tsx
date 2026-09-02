/** Ported verbatim from TMV-Chat-bot's dashboard/web/src/components/ShortcutsModal.tsx. */
import React, { useEffect } from "react";
import { Keyboard, X } from "lucide-react";
import { IconButton } from "../../../../ui";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: "⌘K / Ctrl+K / /", desc: "Open Command Palette / Search" },
  { key: "?", desc: "Show / Hide Keyboard Shortcuts Modal" },
  { key: "R", desc: "Sync Live Sheets Data" },
  { key: "O", desc: "Go to Overview" },
  { key: "J", desc: "Go to Jobs" },
  { key: "D", desc: "Go to Drivers" },
  { key: "Esc", desc: "Close modal or lightbox" }
];

export function ShortcutsModal({ isOpen, onClose }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-admin-ink/30 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white border border-admin-line rounded shadow-elevated overflow-hidden text-admin-ink">
        <div className="flex items-center justify-between px-5 py-3 border-b border-admin-line bg-admin-surface/50">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-admin-brand" />
            <h3 className="text-btn text-admin-ink">Keyboard Shortcuts</h3>
          </div>
          <IconButton aria-label="Close" icon={<X />} size="sm" onClick={onClose} />
        </div>

        <div className="p-4 space-y-1.5">
          {SHORTCUTS.map((sc, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-admin-line/60 text-xs">
              <span className="text-admin-ink-2">{sc.desc}</span>
              <kbd className="px-2 py-0.5 bg-admin-surface border border-admin-line rounded font-mono text-admin-ink text-[11px]">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="px-5 py-2.5 bg-admin-surface/30 border-t border-admin-line text-[11px] text-admin-muted text-right">
          Press <kbd className="font-mono bg-admin-surface px-1.5 py-0.5 rounded border border-admin-line">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
