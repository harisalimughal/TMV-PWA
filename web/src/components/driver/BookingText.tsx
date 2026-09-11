import React from "react";
import { cx } from "../../ui";

/** A "Label: value" line -- same shape as backend's booking.service.ts LABEL_LINE
 *  (label starts with a letter, no leading digit, so a numbered address line like
 *  "119 Queens Road: SE15 2EZ" is never mistaken for one). */
const BOOKING_LABEL_LINE = /^([A-Za-z][A-Za-z /&'().+-]{0,28})\s*[:=]\s*(.*)$/;

interface BookingField {
  label: string;
  value: string;
}
type BookingItem =
  | { type: "field"; key: string; field: BookingField }
  | { type: "text"; key: string; text: string }
  | { type: "break"; key: string };

/**
 * Turns the raw Calendar description into a light display structure -- NOT a re-parse
 * of business fields (job.pickup/job.dropoff/etc already exist for that; this is only
 * about how the same text reads). A "Label: value" line becomes a labelled block; a
 * bare line right after one folds into that field's value, the same way an address
 * split across two physical lines reads as one address (see backend's
 * withContinuation); a blank line starts a new visual group, same as the source text's
 * own paragraph breaks; anything else is a plain line. Driven entirely by the shape of
 * the text itself -- nothing here is tied to a specific field's name or wording, so it
 * reads any booking the same way regardless of what labels the office happened to use.
 */
function parseBookingText(text: string): BookingItem[] {
  const items: BookingItem[] = [];
  let current: BookingField | null = null;
  let key = 0;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      current = null;
      if (items.length > 0 && items[items.length - 1].type !== "break") {
        items.push({ type: "break", key: String(key++) });
      }
      continue;
    }
    const match = line.match(BOOKING_LABEL_LINE);
    if (match) {
      current = { label: match[1].trim(), value: match[2].trim() };
      items.push({ type: "field", key: String(key++), field: current });
    } else if (current) {
      current.value = current.value ? `${current.value}, ${line}` : line;
    } else {
      items.push({ type: "text", key: String(key++), text: line });
    }
  }
  return items;
}

export interface BookingTextProps {
  text: string;
  /** Field values to leave out -- e.g. the customer's name/email/phone when those
   *  already have their own structured rows elsewhere on the same card, so this
   *  block doesn't just repeat them under whatever label wording this particular
   *  booking happened to use ("Name:", "Full name:", "Customer:", ...). Matched by
   *  value, not label, since the label varies but the already-shown value doesn't. */
  excludeValues?: Array<string | undefined>;
  className?: string;
}

/**
 * Renders a Calendar description as a light "spec sheet": each detected "Label:
 * value" line as its own row (label as a small caption, value below it) with a
 * divider between rows, grouped by the source text's own blank-line paragraph
 * breaks. Shared by JobWorkflowScreen.tsx's ReadyCard (the full raw-booking block)
 * and JobDetailsPanel.tsx's "More details" section (the same block, minus whatever
 * fields already have their own structured rows above it).
 */
export function BookingText({ text, excludeValues, className }: BookingTextProps) {
  const exclude = new Set(
    (excludeValues ?? []).filter((v): v is string => Boolean(v?.trim())).map(v => v.trim().toLowerCase())
  );

  return (
    <div className={cx("flex flex-col", className)}>
      {parseBookingText(text).map(item => {
        if (item.type === "break") return <div key={item.key} className="h-3.5" aria-hidden />;
        if (item.type === "text") {
          return (
            <p key={item.key} className="py-1 text-body text-fg [overflow-wrap:anywhere]">
              {item.text}
            </p>
          );
        }
        if (exclude.has(item.field.value.trim().toLowerCase())) return null;
        return (
          <div key={item.key} className="border-b border-line/60 py-1.5 last:border-b-0">
            <p className="text-eyebrow uppercase tracking-wide text-fg-subtle">{item.field.label}</p>
            {item.field.value && (
              <p className="mt-0.5 text-body text-fg [overflow-wrap:anywhere]">{item.field.value}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
