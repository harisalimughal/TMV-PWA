import React, { useId } from "react";
import { Check } from "lucide-react";

interface ChoiceProps {
  label: string;
  description?: string;
  selected: boolean;
  onToggle: () => void;
  type: "checkbox" | "radio";
  name?: string;
}

/**
 * A selectable row.
 *
 * The native checkbox is kept in the DOM (visually hidden, not removed) so screen
 * readers, keyboard users and form semantics all still work -- the visible tick is
 * just a bigger, thumb-friendly presentation of it. The whole 56px row is the target,
 * rather than the 16px box the old version relied on.
 */
export function Choice({ label, description, selected, onToggle, type, name }: ChoiceProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`flex items-center gap-3.5 rounded-card border px-4 py-3.5 min-h-[58px] cursor-pointer transition duration-fast active:scale-[0.99] ${
        selected ? "bg-brand-subtle border-brand" : "bg-surface border-line"
      }`}
    >
      <input
        id={id}
        type={type}
        name={name}
        checked={selected}
        onChange={onToggle}
        className="sr-only peer"
      />
      <span
        aria-hidden
        className={`shrink-0 w-6 h-6 flex items-center justify-center border-2 transition-colors ${
          type === "radio" ? "rounded-full" : "rounded-[6px]"
        } ${selected ? "bg-brand border-brand text-brand-fg" : "bg-surface border-line-strong text-transparent"}`}
      >
        {type === "radio" ? (
          selected && <span className="w-2.5 h-2.5 rounded-full bg-brand-fg" />
        ) : (
          <Check className="w-4 h-4 stroke-[3]" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-helper text-fg-subtle">{description}</span>}
      </span>
    </label>
  );
}

/** Wraps a group of Choices with the fieldset/legend a screen reader needs to
 *  understand that they belong together. None of the old groups had one. */
export function ChoiceGroup({
  legend,
  hint,
  children
}: {
  legend: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="border-0 p-0 m-0 min-w-0">
      <legend className="mb-2 pl-0.5 text-label text-fg-muted">
        {legend}
        {hint && <span className="block font-normal text-fg-subtle mt-0.5">{hint}</span>}
      </legend>
      <div className="flex flex-col gap-2.5">{children}</div>
    </fieldset>
  );
}

/** Two large side-by-side buttons for a yes/no question. */
export function YesNo({
  question,
  busy,
  yesLabel = "Yes",
  noLabel = "No",
  onYes,
  onNo
}: {
  question: string;
  busy: boolean;
  yesLabel?: string;
  noLabel?: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-fg">{question}</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onNo}
          disabled={busy}
          className="min-h-[56px] rounded-control border border-line bg-surface text-button text-fg active:scale-[0.98] active:bg-surface-sunken transition duration-fast disabled:opacity-50"
        >
          {noLabel}
        </button>
        <button
          onClick={onYes}
          disabled={busy}
          className="min-h-[56px] rounded-control bg-warning-subtle border border-warning-line text-warning text-button active:scale-[0.98] transition duration-fast disabled:opacity-50"
        >
          {yesLabel}
        </button>
      </div>
    </div>
  );
}
