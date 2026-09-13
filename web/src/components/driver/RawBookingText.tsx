import React from "react";
import { cx } from "../../ui";

/** A "Label: value" line -- label starts with a letter (never a digit), so a
 *  numbered address line like "119 Queens Road: SE15 2EZ" is never mistaken for
 *  one. Same shape as backend's booking.service.ts LABEL_LINE. */
const LABEL_LINE = /^([A-Za-z][A-Za-z /&'().+-]{0,28})\s*[:=]\s*(.*)$/;

type Line =
  | { type: "field"; key: string; label: string; value: string }
  | { type: "text"; key: string; text: string }
  | { type: "break"; key: string };

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let key = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (lines.length > 0 && lines[lines.length - 1].type !== "break") {
        lines.push({ type: "break", key: String(key++) });
      }
      continue;
    }
    const match = line.match(LABEL_LINE);
    lines.push(
      match
        ? { type: "field", key: String(key++), label: match[1].trim(), value: match[2].trim() }
        : { type: "text", key: String(key++), text: line }
    );
  }
  return lines;
}

export interface RawBookingTextProps {
  text: string;
  className?: string;
}

/**
 * The Calendar description exactly as booked -- every line kept, in the office's
 * own order and wording; nothing dropped, reshuffled, or grouped into cards. The
 * only liberty taken: a "Label: value" line bolds its label so the block reads at
 * a glance, the way a printed booking sheet does -- the value itself stays a
 * normal weight so the labels stay the visual anchor of the block, not the values.
 */
export function RawBookingText({ text, className }: RawBookingTextProps) {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      {splitLines(text).map(line => {
        if (line.type === "break") return <div key={line.key} className="h-2.5" aria-hidden />;
        if (line.type === "text") {
          return (
            <p key={line.key} className="text-body leading-relaxed text-fg [overflow-wrap:anywhere]">
              {line.text}
            </p>
          );
        }
        return (
          <p key={line.key} className="text-body leading-relaxed [overflow-wrap:anywhere]">
            <span className="font-semibold text-fg">{line.label}:</span> <span className="text-fg-muted">{line.value}</span>
          </p>
        );
      })}
    </div>
  );
}
