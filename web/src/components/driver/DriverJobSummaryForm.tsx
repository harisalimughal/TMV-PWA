import React, { useEffect, useRef, useState } from "react";
import { Alert, Button, Field, Select } from "../../ui";
import type { Job, DriverJobSummaryInput } from "../../api/jobs";

const HOURS = Array.from({ length: 25 }, (_, index) => 2 + index / 2);
type Draft = { driverJobHours: string; helperHours: string };
const key = (job: Job) => `tmv:manual-details:v3:${job.driverInitials}:${job.jobId}`;
export function clearManualDetailsDraft(job: Job): void {
  try { localStorage.removeItem(key(job)); localStorage.removeItem(`tmv:manual-details:v2:${job.driverInitials}:${job.jobId}`); } catch {}
}
const validHours = (value: string) => HOURS.includes(Number(value));
function restored(job: Job): Draft {
  try {
    const saved = JSON.parse(localStorage.getItem(key(job)) || "null");
    const draft = saved?.draft;
    if (saved?.version === 3 && draft && typeof draft.driverJobHours === "string" &&
        typeof draft.helperHours === "string" && (draft.driverJobHours === "" || validHours(draft.driverJobHours)) &&
        (draft.helperHours === "" || validHours(draft.helperHours))) return draft;
  } catch {}
  return { driverJobHours: "", helperHours: "" };
}

export function DriverJobSummaryForm({ job, submitting, onSubmit }: {
  job: Job; submitting: boolean; onSubmit: (input: DriverJobSummaryInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => restored(job));
  const [storageError, setStorageError] = useState(false);
  const submittingRef = useRef(false);
  useEffect(() => {
    try { localStorage.setItem(key(job), JSON.stringify({ version: 3, savedAt: Date.now(), draft })); setStorageError(false); }
    catch { setStorageError(true); }
  }, [draft, job.jobId, job.driverInitials]);
  const blocked = !validHours(draft.driverJobHours) ? "Select driver job hours." : undefined;
  const options = HOURS.map(hours => <option key={hours} value={String(hours)}>{Math.floor(hours)}:{hours % 1 ? "30" : "00"}</option>);
  return <form className="flex flex-col gap-5" onSubmit={async event => {
    event.preventDefault();
    if (blocked || submitting || submittingRef.current) return;
    submittingRef.current = true;
    try { await onSubmit({ schemaVersion: 3, driverJobHours: draft.driverJobHours, helperHours: draft.helperHours }); }
    finally { submittingRef.current = false; }
  }}>
    <header><h1 className="text-title text-fg">Manual details</h1><p className="mt-1 font-mono text-helper text-fg-muted">{job.jobId}</p></header>
    {storageError && <Alert tone="warning">Draft storage is unavailable on this device.</Alert>}
    <fieldset disabled={submitting} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <Field label="Driver job hours" required>{control => <Select {...control} placeholder="Select hours" value={draft.driverJobHours} onChange={event => setDraft(current => ({ ...current, driverJobHours: event.target.value }))}>{options}</Select>}</Field>
      <Field label="Helper job hours">{control => <Select {...control} value={draft.helperHours} onChange={event => setDraft(current => ({ ...current, helperHours: event.target.value }))}><option value="">No helper</option>{options}</Select>}</Field>
    </fieldset>
    <Button type="submit" fullWidth size="lg" loading={submitting} blockedReason={blocked} onBlocked={() => undefined} className="[&>span>span]:whitespace-normal [&>span>span]:overflow-visible">Submit Manual details &amp; next</Button>
  </form>;
}
