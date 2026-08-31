import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, cx } from "../../ui";
import { Modal } from "../../ui/Modal";
import { formatDateKeyLong, todayKey } from "../../lib/jobDates";

export interface DatePickerSheetProps {
  open: boolean;
  /** Currently selected "YYYY-MM-DD", or null. */
  value: string | null;
  onClose: () => void;
  onSelect: (key: string) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Monday-first weekday index (0 = Mon … 6 = Sun) for a Y/M/D. */
function mondayIndex(y: number, m: number, d: number): number {
  return (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7;
}

/**
 * A compact month calendar in a bottom sheet (centred dialog on ≥sm). No dependency —
 * a plain grid of <button> day cells, so it's keyboard-operable and themable. Modal
 * supplies the focus trap, Esc-to-close and scroll lock.
 */
export function DatePickerSheet({ open, value, onClose, onSelect }: DatePickerSheetProps) {
  const initial = value || todayKey();
  const [viewYear, setViewYear] = useState(() => Number(initial.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(initial.slice(5, 7)) - 1);

  const tKey = todayKey();

  const weeks = useMemo(() => {
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    const lead = mondayIndex(viewYear, viewMonth, 1);
    const cells: Array<number | null> = [
      ...Array<null>(lead).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: Array<Array<number | null>> = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  }

  function pick(day: number) {
    onSelect(keyOf(viewYear, viewMonth, day));
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Pick a date" size="sm">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
            className="grid size-9 place-items-center rounded-control text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <ChevronLeft className="size-[18px]" />
          </button>
          <span className="text-card text-fg" aria-live="polite">
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
            className="grid size-9 place-items-center rounded-control text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <ChevronRight className="size-[18px]" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map(w => (
            <div key={w} className="py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">
              {w}
            </div>
          ))}
          {weeks.flat().map((day, i) => {
            if (day === null) return <div key={i} aria-hidden />;
            const key = keyOf(viewYear, viewMonth, day);
            const isSelected = key === value;
            const isToday = key === tKey;
            return (
              <button
                key={i}
                type="button"
                onClick={() => pick(day)}
                aria-label={formatDateKeyLong(key)}
                aria-pressed={isSelected}
                className={cx(
                  "grid h-10 place-items-center rounded-control text-[14px] font-medium tabular-nums transition-colors",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                  isSelected
                    ? "bg-brand font-semibold text-brand-fg"
                    : "text-fg hover:bg-surface-sunken",
                  !isSelected && isToday && "ring-1 ring-inset ring-brand text-brand",
                )}
              >
                {day}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-line pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setViewYear(Number(tKey.slice(0, 4)));
              setViewMonth(Number(tKey.slice(5, 7)) - 1);
            }}
          >
            Jump to today
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
