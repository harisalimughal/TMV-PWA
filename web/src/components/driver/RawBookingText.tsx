import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";

/** A "Label: value" line -- label starts with a letter (never a digit), so a
 *  numbered address line like "119 Queens Road: SE15 2EZ" is never mistaken for
 *  one. Same shape as backend's booking.service.ts LABEL_LINE. */
const LABEL_LINE = /^([A-Za-z][A-Za-z /&'().+-]{0,28})\s*[:=]\s*(.*)$/;

/** Label phrases that mean "this value is an address" -- same vocabulary family as
 *  backend's booking.service.ts PICKUP_LABELS/DROPOFF_LABELS/STOP_BY_LABELS, kept to
 *  multi-word phrases only (never a bare "from"/"to"/"address") so a line like
 *  "Floor From and To: ..." or "Email Address: ..." is never mistaken for one. */
const ADDRESS_LABEL_KEYWORDS = [
  "pick up", "pickup", "pick address", "collection", "move from", "loading address", "load from",
  "drop-off", "drop off", "dropoff", "delivery", "deliver", "move to", "unloading", "unload to",
  "destination", "stop by", "stop-by", "stopby", "stop off", "waypoint"
];

function looksLikeAddress(label: string): boolean {
  const l = label.toLowerCase();
  return ADDRESS_LABEL_KEYWORDS.some(keyword => l.includes(keyword));
}

/** Same vocabulary family as backend's booking.service.ts PHONE_LABELS. A phone line
 *  reads as the end of the "who to contact" group, so it gets a light divider after
 *  it -- same idea as the source's own blank-line breaks, just for a split the
 *  office's wording doesn't always put a blank line at. */
const PHONE_LABEL_KEYWORDS = ["phone", "mobile", "telephone", "mob", "cell", "tel"];

function looksLikePhone(label: string): boolean {
  const l = label.toLowerCase();
  return PHONE_LABEL_KEYWORDS.some(keyword => l.includes(keyword));
}

/** A bare URL, e.g. a pasted Gmail thread link -- checked before LABEL_LINE because
 *  "https://..." would otherwise itself match as a "https" label with the rest of
 *  the URL as its value (":" right after "https" satisfies the label/value split). */
const STARTS_WITH_URL = /^https?:\/\//i;

/** Finds every http(s) URL in a chunk of text so it can be rendered as a link
 *  instead of dead text -- the office sometimes pastes a Gmail thread link or
 *  similar straight into the Calendar description. */
const URL_PATTERN = /https?:\/\/[^\s]+/gi;

type Line =
  | { type: "field"; label: string; value: string }
  | { type: "text"; text: string };

/** Lines grouped by the source text's own blank-line paragraph breaks -- each group
 *  becomes one visually separated section, the same shape the office's own blank
 *  lines already imply. */
function splitSections(text: string): Line[][] {
  const sections: Line[][] = [];
  let current: Line[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (current.length > 0) {
        sections.push(current);
        current = [];
      }
      continue;
    }
    const match = STARTS_WITH_URL.test(line) ? null : line.match(LABEL_LINE);
    current.push(match ? { type: "field", label: match[1].trim(), value: match[2].trim() } : { type: "text", text: line });
  }
  if (current.length > 0) sections.push(current);
  return sections;
}

/** Renders a chunk of text with any http(s) URL inside it swapped for a clickable,
 *  underlined link -- trailing punctuation right after the URL (a sentence's closing
 *  "." or a wrapping ")") is kept out of the href so it still reads as prose. */
function linkifyText(value: string): React.ReactNode {
  if (!value || !/https?:\/\//i.test(value)) return value;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of value.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) nodes.push(value.slice(lastIndex, start));
    let url = match[0];
    let trailing = "";
    const trailingPunctuation = url.match(/[).,;:!?]+$/);
    if (trailingPunctuation) {
      trailing = trailingPunctuation[0];
      url = url.slice(0, -trailing.length);
    }
    nodes.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-brand underline underline-offset-2 [overflow-wrap:anywhere]"
      >
        {url}
      </a>
    );
    if (trailing) nodes.push(trailing);
    lastIndex = start + match[0].length;
  }
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex));
  return nodes;
}

export interface RawBookingTextProps {
  text: string;
  className?: string;
}

/**
 * The Calendar description exactly as booked -- every line kept, in the office's
 * own order and wording; nothing dropped or reshuffled. Liberties taken purely for
 * readability, none touching the words themselves: a "Label: value" line bolds its
 * label (the value stays normal weight, so labels stay the visual anchor); the
 * source's own blank-line paragraph breaks become light dividers instead of bare
 * vertical gaps; and an address-looking line (pickup/drop-off/stop-by, by label
 * wording -- see ADDRESS_LABEL_KEYWORDS) gets a tap-to-copy icon in front of its
 * value, same copy-to-clipboard pattern as JobRoute's address rows.
 */
export function RawBookingText({ text, className }: RawBookingTextProps) {
  const [copied, setCopied] = useState<string | null>(null);

  function copyValue(value: string) {
    if (!value) return;
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        haptics.tap();
        setCopied(value);
        window.setTimeout(() => setCopied(current => (current === value ? null : current)), 1500);
      })
      .catch(() => {
        /* Clipboard access denied/unavailable -- the value is still readable and
         * selectable, so this is a silent no-op rather than an error. */
      });
  }

  return (
    <div className={cx("flex flex-col", className)}>
      {splitSections(text).map((section, i) => (
        <div
          key={i}
          className={cx(
            "flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0",
            i > 0 && "border-t border-line/60"
          )}
        >
          {section.map((line, j) => {
            if (line.type === "text") {
              return (
                <p key={j} className="text-body leading-relaxed text-fg [overflow-wrap:anywhere]">
                  {linkifyText(line.text)}
                </p>
              );
            }
            const isAddress = looksLikeAddress(line.label) && Boolean(line.value);
            const isCopied = copied === line.value;
            // A divider right after Phone, same as the section dividers above --
            // unless Phone is already the last line here, where that border would
            // just double up against the next section's own top border.
            const dividerAfter = looksLikePhone(line.label) && j < section.length - 1;
            return (
              <React.Fragment key={j}>
                <p className="text-body leading-relaxed [overflow-wrap:anywhere]">
                  <span className="font-semibold text-fg">{line.label}:</span>{" "}
                  <span className="text-fg-muted">{linkifyText(line.value)}</span>
                  {isAddress && (
                    <button
                      type="button"
                      onClick={() => copyValue(line.value)}
                      aria-label={`Copy ${line.label}`}
                      className={cx(
                        "ml-1 inline-flex translate-y-[3px] items-center gap-1 rounded-pill px-1.5 py-1 align-middle transition-colors active:scale-95",
                        isCopied ? "text-success" : "text-fg-subtle hover:bg-surface-sunken"
                      )}
                    >
                      {isCopied ? (
                        <>
                          <Check className="size-3.5" aria-hidden />
                          <span className="text-meta font-semibold">Copied</span>
                        </>
                      ) : (
                        <Copy className="size-3.5" aria-hidden />
                      )}
                    </button>
                  )}
                </p>
                {dividerAfter && <div className="mt-1 border-t border-line/60 pt-0.5" aria-hidden />}
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}
