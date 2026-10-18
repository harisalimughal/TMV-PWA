import React from "react";
import { Modal } from "../../../../ui/Modal";
import { isMacPlatform } from "../utils/platform";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** Keyboard shortcuts reference. Uses the shared Modal (dialog semantics, focus trap,
 *  Escape, focus restore). Labels describe what each key really does. */
export function ShortcutsModal({ isOpen, onClose }: Props) {
  const mod = isMacPlatform() ? "⌘" : "Ctrl";
  const shortcuts: Array<[string, string]> = [
    [`${mod} K  or  /`, "Search jobs or jump to a page"],
    ["?", "Show keyboard shortcuts"],
    ["R", "Refresh the data on this page"],
    ["O", "Go to Overview"],
    ["B", "Go to Bookings"],
    ["J", "Go to Jobs"],
    ["A", "Go to Activity"],
    ["D", "Go to Drivers"],
    ["Esc", "Close the open panel or dialog"]
  ];
  return (
    <Modal open={isOpen} onClose={onClose} title="Keyboard shortcuts" size="md" placement="center">
      <p className="mb-3 text-[13px] text-admin-ink-2">Single-key shortcuts are ignored while you are typing in a field.</p>
      <dl className="divide-y divide-admin-line">
        {shortcuts.map(([keys, description]) => (
          <div key={keys} className="flex items-center justify-between gap-4 py-2 text-[14px]">
            <dt className="text-admin-ink">{description}</dt>
            <dd><kbd className="whitespace-nowrap rounded border border-admin-line bg-admin-surface px-2 py-0.5 font-sans text-[12.5px] font-semibold text-admin-ink">{keys}</kbd></dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
