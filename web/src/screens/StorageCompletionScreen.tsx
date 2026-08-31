import React from "react";
import { ArrowRight, Check } from "lucide-react";
import { AppShell } from "../app/AppShell";
import { BottomActionBar, Button } from "../ui";

export interface StorageSummary {
  scenario: "checkin" | "checkout";
  container: string;
  clientName: string;
  /** yyyy-mm-dd from the form's date field. */
  date: string;
  photoCount: number;
  /** "Yes" / "No" / "". */
  clientPresent: string;
  /** True when it went to the offline outbox instead of straight to the server. */
  queued: boolean;
}

function formatUKDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London"
  });
}

function nowTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London"
  }).format(new Date());
}

interface StorageCompletionScreenProps {
  summary: StorageSummary;
  onHome: () => void;
}

/**
 * Recorded after a storage Check In / Check Out — a branded block, then the
 * submitted record as ruled rows. Reached only from a real success.
 */
export function StorageCompletionScreen({ summary, onHome }: StorageCompletionScreenProps) {
  const isCheckIn = summary.scenario === "checkin";
  const rows: Array<[string, string]> = [
    ["Operation", isCheckIn ? "Storage in" : "Storage out"],
    ["Container", summary.container || "—"],
    ["Client", summary.clientName || "—"],
    ["Date", formatUKDate(summary.date)],
    ["Evidence", `${summary.photoCount} photo${summary.photoCount === 1 ? "" : "s"}`]
  ];
  if (summary.clientPresent) rows.push(["Client present", summary.clientPresent]);
  rows.push(["Status", summary.queued ? "Saved — will sync" : "Recorded"]);

  return (
    <AppShell
      dock={
        <BottomActionBar>
          <Button size="lg" fullWidth iconRight={<ArrowRight />} onClick={onHome}>
            Return to jobs
          </Button>
        </BottomActionBar>
      }
    >
      <div className="px-4 pt-safe">
        <div className="pt-8">
          <span className="grid size-11 place-items-center rounded-full border border-success-line bg-success-subtle text-success-signal">
            <Check className="size-[22px] stroke-[2.5]" aria-hidden />
          </span>
          <h1 className="mt-4 text-title text-fg">
            {isCheckIn ? "Check in complete" : "Check out complete"}
          </h1>
          <p className="mt-1.5 text-body text-fg-muted">
            Recorded at {nowTime()}.{" "}
            {summary.queued
              ? "Saved on this device — it'll sync when you're back online."
              : isCheckIn
                ? "The items are recorded as entering storage."
                : "The items are recorded as leaving storage."}
          </p>
        </div>

        <dl className="mt-7">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 border-b border-line py-3.5 first:border-t"
            >
              <dt className="text-label font-normal text-fg-muted">{label}</dt>
              <dd className="text-body font-semibold text-fg">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="scroll-pb-dock" aria-hidden />
      </div>
    </AppShell>
  );
}
