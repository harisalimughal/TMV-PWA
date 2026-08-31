import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Car, CheckCircle2, ChevronLeft, FileWarning, PenLine } from "lucide-react";
import {
  fetchJobDetail,
  sendAction,
  startJob,
  uploadEvidencePhotos,
  uploadSignature,
  type ApiError,
  type Job
} from "../api/jobs";
import { PhotoUploader } from "../components/PhotoUploader";
import { SignatureModal } from "../components/SignatureModal";
import { Choice, ChoiceGroup } from "../components/ui/Choice";
import { useToast } from "../components/ui/Toast";
import { AppShell } from "../app/AppShell";
import { Alert, BottomActionBar, Button, cx, PageHeader, Skeleton } from "../ui";
import {
  CompletionSummary,
  IssueChoiceCard,
  IssueDecision,
  JobHeader,
  JobProgress,
  JobStatusChip,
  RouteCard,
  WarningNotice
} from "../components/driver";
import { ScenarioFormScreen } from "./ScenarioFormScreen";
import { useOnline } from "../lib/net";
import type { ScenarioKey } from "../scenarioSpec";
import {
  BACK_ELIGIBLE,
  CREW_SIZE_OPTIONS,
  EXTRA_CHARGE_OPTIONS,
  NO_EXTRAS,
  overtimeApplies,
  PAYMENT_METHODS,
  STEPS,
  workflowProgress
} from "./workflow/steps";

interface JobWorkflowScreenProps {
  jobId: string;
  onBack: () => void;
}

const LONDON = "Europe/London";

/** "yyyy-MM-dd" as seen in Europe/London -- the operating timezone, regardless of the
 *  device's own setting. A device several hours ahead previously compared calendar
 *  days in the wrong zone and flagged today's own job as "not today". */
function londonDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LONDON }).format(date);
}

function isNotToday(bookedStart: string): boolean {
  if (!bookedStart) return false;
  const booked = new Date(bookedStart);
  if (Number.isNaN(booked.getTime())) return false;
  return londonDateKey(booked) !== londonDateKey(new Date());
}

function formatBookedDay(bookedStart: string): string {
  try {
    return new Date(bookedStart).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: LONDON
    });
  } catch {
    return "";
  }
}

/** Pre-selects the job's booked crew size, but the driver can change it -- the crew
 *  actually working the overtime can differ from what was booked. */
function defaultOvertimeCrewSize(job: Job): "1" | "2" | "3" {
  if (job.crewSize === 1) return "1";
  if (job.crewSize === 3) return "3";
  return "2";
}

export function JobWorkflowScreen({ jobId, onBack }: JobWorkflowScreenProps) {
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [suggestedTotal, setSuggestedTotal] = useState(0);
  const [confirmationText, setConfirmationText] = useState(DEFAULT_CUSTOMER_CONFIRMATION_TEXT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [openScenario, setOpenScenario] = useState<ScenarioKey | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const online = useOnline();

  // A step's form value lives in the module-level `formState` object (see the note by
  // its declaration), which means mutating it re-renders nothing on its own. Every
  // handler that touches `formState` also calls `bumpForm`, which re-renders this
  // screen -- and with it BOTH the StepBody (the inputs) and the StepDock (the submit
  // button, which reads `formState` to decide whether it's still blocked). Without
  // this the docked button stayed frozen at whatever it was on first render: take the
  // arrival photo and "Upload photo" never woke up.
  const [, setFormVersion] = useState(0);
  const bumpForm = useCallback(() => setFormVersion(v => v + 1), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJobDetail(jobId);
      setJob(result.job);
      setSuggestedTotal(result.suggestedTotal);
      if (result.confirmationText) setConfirmationText(result.confirmationText);
    } catch (err) {
      setError((err as ApiError)?.message || "Couldn't load this job.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Defensive: never let one job's half-filled form leak into the next.
  useEffect(() => () => resetFormState(), []);

  const autoSkippedFrom = useRef<string | null>(null);

  /**
   * Runs a workflow action. Returns whether it succeeded so callers (the signature
   * modal in particular) can decide whether to close -- a failure keeps the modal open
   * with the error visible, so the customer doesn't have to sign a second time.
   *
   * Workflow steps are deliberately not queued when offline: each one advances a
   * server-side state machine and the driver needs to see the real next step before
   * continuing. Replaying them later, out of order, would corrupt the job. So they
   * block with an honest message, and every form keeps its state so nothing is lost.
   */
  const run = useCallback(
    async (action: () => Promise<{ job: Job }>, successMessage?: string): Promise<boolean> => {
      if (!online) {
        toast.error("You're offline. Reconnect to continue this job — nothing you've entered is lost.");
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await action();
        setJob(result.job);
        if (successMessage) toast.success(successMessage);
        // A new step means new content: put the driver at the top of it rather than
        // wherever the previous step happened to be scrolled to.
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        return true;
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError?.message || "That didn't work. Try again.");
        return false;
      } finally {
        setBusy(false);
        setUploadProgress(null);
      }
    },
    [online, toast]
  );

  // Belt-and-braces skip: if the workflow ever lands on the Overtime step for a job
  // that never picked "Extra time / Charges" (e.g. a backend that still emits the
  // state), step straight past it without recording any overtime. The dev mock
  // already routes around Overtime in that case, so this is normally inert.
  useEffect(() => {
    if (!job || job.currentState !== "WAITING_OVERTIME") {
      autoSkippedFrom.current = null;
      return;
    }
    if (overtimeApplies(job.extraCharges) || busy || !online || autoSkippedFrom.current === job.jobId) {
      return;
    }
    autoSkippedFrom.current = job.jobId;
    void run(() => sendAction(job.jobId, "SUBMIT_OVERTIME", {}));
  }, [job, busy, online, run]);

  if (loading) {
    return (
      <AppShell header={<PageHeader title="Loading job…" onBack={onBack} backLabel="Back to jobs" />}>
        <div className="flex flex-col gap-4 px-4 py-6">
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-14 w-full rounded-card" />
        </div>
      </AppShell>
    );
  }

  if (!job) {
    return (
      <AppShell header={<PageHeader title="Job" onBack={onBack} backLabel="Back to jobs" />}>
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <AlertTriangle className="size-9 text-danger" aria-hidden />
          <p className="max-w-xs text-body text-fg-muted">
            {error || "This job couldn't be found."}
          </p>
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Back to jobs
          </Button>
        </div>
      </AppShell>
    );
  }

  if (openScenario) {
    return (
      <ScenarioFormScreen
        jobId={job.jobId}
        scenario={openScenario}
        onCancel={() => setOpenScenario(null)}
        onDone={() => {
          setOpenScenario(null);
          void load();
        }}
      />
    );
  }

  const state = job.currentState;
  const step = STEPS[state] ?? { label: state, order: 1 };
  const complete = state === "COMPLETED";
  const routeExpanded = state === "READY" || state === "WAITING_ARRIVAL_PHOTO";

  // Does this job's workflow include the Overtime step? While the driver is still on
  // the Extra charges step their live checkbox selection is the freshest signal;
  // afterwards it's whatever the server recorded.
  const overtime =
    state === "WAITING_EXTRA_CHARGES"
      ? overtimeApplies(formState.extraCharges)
      : overtimeApplies(job.extraCharges);
  const progress = workflowProgress(state, { overtime });

  return (
    <>
      <AppShell
        contentRef={scrollRef}
        header={
          <JobHeader
            customerName={job.customerName}
            jobId={job.jobId}
            phone={job.customerPhone || undefined}
            onBack={onBack}
            status={job.status === "IN_PROGRESS" ? <JobStatusChip job={job} /> : undefined}
          />
        }
        dock={
          <StepDock
            state={state}
            overtime={overtime}
            busy={busy}
            online={online}
            uploadProgress={uploadProgress}
            onStart={() => run(() => startJob(job.jobId), "Job started")}
            onAction={(action, input, message) => run(() => sendAction(job.jobId, action, input), message)}
            onUploadPhotos={files =>
              run(() => uploadEvidencePhotos(job.jobId, files, setUploadProgress), "Photos uploaded")
            }
            onOpenSignature={() => setSignatureOpen(true)}
            onBackHome={onBack}
            onBlocked={reason => toast.error(reason)}
          />
        }
      >
        {complete ? (
          <div className="px-4 pb-5">
            <CompletionSummary job={job} />
            <div className="scroll-pb-dock" aria-hidden />
          </div>
        ) : (
          <div className="flex flex-col gap-5 px-4 py-5">
            <JobProgress current={progress.current} total={progress.total} />

            <>
              <div>
                <h1 className="text-title text-fg">{step.label}</h1>
                {step.hint && <p className="mt-1.5 text-body text-fg-muted">{step.hint}</p>}
              </div>

              {isNotToday(job.bookedStart) && (
                <WarningNotice title="Check the date">
                  This job is booked for <strong>{formatBookedDay(job.bookedStart)}</strong>, not today. Make
                  sure you've opened the right one.
                </WarningNotice>
              )}

              {!online && (
                <Alert tone="warning">
                  You're offline. Fill this in now if you like — you just can't submit until you have signal
                  again.
                </Alert>
              )}

              <RouteCard pickup={job.pickup} dropoff={job.dropoff} collapsible={!routeExpanded} />

              {error && <Alert tone="danger">{error}</Alert>}

              <StepBody
                job={job}
                state={state}
                busy={busy}
                uploadProgress={uploadProgress}
                error={error}
                suggestedTotal={suggestedTotal}
                onOpenScenario={setOpenScenario}
                onFormChange={bumpForm}
              />

              {BACK_ELIGIBLE.has(state) && (
                <button
                  onClick={() => run(() => sendAction(job.jobId, "GO_BACK"))}
                  disabled={busy}
                  className="-ml-2 flex items-center gap-1 self-start rounded-control px-2 py-2 text-label font-medium text-fg-muted transition-colors hover:bg-surface-sunken disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  Go back a step
                </button>
              )}
            </>

            <div className="scroll-pb-dock" aria-hidden />
          </div>
        )}
      </AppShell>

      <SignatureModal
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        busy={busy}
        progress={uploadProgress}
        title="Customer sign-off"
        instruction="Hand the phone to the customer. They read the confirmation and sign to accept the completed move."
        agreementText={confirmationText}
        signerName={job.customerName || undefined}
        onSave={async blob => {
          const ok = await run(
            () => uploadSignature(job.jobId, job.customerName, blob, setUploadProgress),
            "Signature saved"
          );
          if (ok) setSignatureOpen(false);
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------- step body --- */

/**
 * The scrolling part of each step. The submit control is NOT here -- it lives in the
 * dock below, so it's always under the thumb. That split is why the forms below
 * publish their value through module-level state rather than owning their own button.
 */

/** Shared state between StepBody and StepDock. Two sibling components need the same
 *  form value (one renders the inputs, one renders the submit), and threading it
 *  through the parent for every step would have meant a dozen more props on a screen
 *  that already had plenty. */
const formState: {
  extraCharges: string[];
  overtimeMinutes: string;
  overtimeCrew: "1" | "2" | "3";
  total: string;
  payment: string;
  photos: File[];
} = {
  extraCharges: [],
  overtimeMinutes: "",
  overtimeCrew: "2",
  total: "",
  payment: "",
  photos: []
};

function resetFormState() {
  formState.extraCharges = [];
  formState.overtimeMinutes = "";
  formState.overtimeCrew = "2";
  formState.total = "";
  formState.payment = "";
  formState.photos = [];
}

function StepBody({
  job,
  state,
  busy,
  uploadProgress,
  error,
  suggestedTotal,
  onOpenScenario,
  onFormChange
}: {
  job: Job;
  state: string;
  busy: boolean;
  uploadProgress: number | null;
  error: string | null;
  suggestedTotal: number;
  onOpenScenario: (scenario: ScenarioKey) => void;
  onFormChange: () => void;
}) {
  // Re-renders the whole workflow screen -- not just this subtree -- so the docked
  // submit button sees the same `formState` change the inputs just made.
  const tick = onFormChange;

  // Reset shared form state whenever the step changes, so values never leak from one
  // step to the next. Steps the driver can navigate back into (Extra charges,
  // Overtime) are re-seeded from what the server already recorded, so a return trip
  // shows their previous answers rather than a blank form — this is what lets them
  // *deselect* "Extra time / Charges" after having gone forward with it.
  useEffect(() => {
    formState.extraCharges = state === "WAITING_EXTRA_CHARGES" ? [...(job.extraCharges ?? [])] : [];
    formState.overtimeMinutes =
      state === "WAITING_OVERTIME" && job.overtimeMinutes ? String(job.overtimeMinutes) : "";
    formState.overtimeCrew = defaultOvertimeCrewSize(job);
    formState.total = suggestedTotal ? suggestedTotal.toFixed(2) : "";
    formState.payment = "";
    formState.photos = [];
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, job.jobId, suggestedTotal]);

  switch (state) {
    case "READY":
      return <ReadyCard job={job} />;

    case "WAITING_ARRIVAL_PHOTO":
      return (
        <PhotoUploader
          key={state}
          label="Arrival photo"
          hint="The property and the load as you found them."
          maxPhotos={1}
          submitting={busy}
          progress={uploadProgress}
          error={error}
          onFilesChange={files => {
            formState.photos = files;
            tick();
          }}
        />
      );

    case "WAITING_LOADED_PHOTO":
      return (
        <PhotoUploader
          key={state}
          label="Van loaded photos"
          hint="Up to 2 — show how the load is stacked and secured."
          maxPhotos={2}
          submitting={busy}
          progress={uploadProgress}
          error={error}
          onFilesChange={files => {
            formState.photos = files;
            tick();
          }}
        />
      );

    case "WAITING_EMPTY_VAN_PHOTO":
      return (
        <PhotoUploader
          key={state}
          label="Empty van photo"
          hint="Proof nothing was left behind."
          maxPhotos={1}
          submitting={busy}
          progress={uploadProgress}
          error={error}
          onFilesChange={files => {
            formState.photos = files;
            tick();
          }}
        />
      );

    case "WAITING_ARRIVAL_ISSUES_CHECK":
    case "WAITING_EMPTY_VAN_ISSUES_CHECK":
      return null; // the decision lives in the dock

    case "WAITING_ARRIVAL_ISSUES_CHOICE":
    case "WAITING_EMPTY_VAN_ISSUES_CHOICE":
      return (
        <div className="flex flex-col gap-3">
          <IssueChoiceCard
            icon={<Car aria-hidden />}
            title="Parking Liability"
            description="Restricted bay, red route, or anywhere a PCN could land. The customer accepts the charge."
            onClick={() => onOpenScenario("parking")}
          />
          <IssueChoiceCard
            icon={<FileWarning aria-hidden />}
            title="Liability Report"
            description="Damage, unprotected items, or an overloaded van. The customer signs to accept liability."
            onClick={() => onOpenScenario("liability")}
          />
        </div>
      );

    case "IN_PROGRESS":
      return <InProgressCard job={job} />;

    case "WAITING_EXTRA_CHARGES":
      return (
        <ChoiceGroup legend="Extra charges" hint="Select every one that applies.">
          {EXTRA_CHARGE_OPTIONS.map(option => (
            <Choice
              key={option}
              type="checkbox"
              label={option}
              selected={formState.extraCharges.includes(option)}
              onToggle={() => {
                const current = formState.extraCharges;
                if (option === NO_EXTRAS) {
                  formState.extraCharges = current.includes(option) ? [] : [option];
                } else {
                  const withoutNone = current.filter(v => v !== NO_EXTRAS);
                  formState.extraCharges = withoutNone.includes(option)
                    ? withoutNone.filter(v => v !== option)
                    : [...withoutNone, option];
                }
                tick();
              }}
            />
          ))}
        </ChoiceGroup>
      );

    case "WAITING_OVERTIME":
      // Overtime only exists when "Extra time / Charges" was picked. If we're here
      // without it, the screen is mid auto-skip — render nothing rather than flash
      // the form.
      if (!overtimeApplies(job.extraCharges)) return null;
      return (
        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="pl-0.5 text-label text-fg-muted">Overtime minutes</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={5}
              value={formState.overtimeMinutes}
              onChange={e => {
                formState.overtimeMinutes = e.target.value;
                tick();
              }}
              placeholder="0"
              className="min-h-control-lg w-full rounded-card border border-line bg-surface px-4 py-3 text-[16px] text-fg outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
            <span className="pl-0.5 text-helper text-fg-subtle">
              Enter 0 if the job finished inside the booked window.
            </span>
          </label>

          {/* Quick-pick chips: overtime is almost always a round number, and typing on
              a numeric keypad next to a van is slower than one tap. */}
          <div className="flex flex-wrap gap-2">
            {["0", "15", "30", "45", "60", "90"].map(value => (
              <button
                key={value}
                onClick={() => {
                  formState.overtimeMinutes = value;
                  tick();
                }}
                className={cx(
                  "min-h-tap rounded-pill border px-4 text-button transition-colors",
                  formState.overtimeMinutes === value
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-line bg-surface text-fg-muted hover:bg-surface-sunken"
                )}
              >
                {value === "0" ? "None" : `${value} min`}
              </button>
            ))}
          </div>

          <ChoiceGroup legend="Crew working the overtime">
            {CREW_SIZE_OPTIONS.map(option => (
              <Choice
                key={option.value}
                type="radio"
                name="overtime_crew_size"
                label={option.label}
                selected={formState.overtimeCrew === option.value}
                onToggle={() => {
                  formState.overtimeCrew = option.value;
                  tick();
                }}
              />
            ))}
          </ChoiceGroup>
        </div>
      );

    case "WAITING_TOTAL_CHARGES":
      return (
        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-brand-line bg-brand-subtle px-4 py-3.5">
            <p className="text-eyebrow uppercase text-brand-subtle-fg">Suggested total</p>
            <p className="mt-0.5 text-display tabular-nums text-brand-subtle-fg">
              £{suggestedTotal.toFixed(2)}
            </p>
            <p className="mt-1 text-helper text-fg-muted">
              Base price plus the extras and overtime you entered. Change it below if the customer agreed
              something different.
            </p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="pl-0.5 text-label text-fg-muted">Total charged (£)</span>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] font-semibold text-fg-subtle">
                £
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={formState.total}
                onChange={e => {
                  formState.total = e.target.value;
                  tick();
                }}
                placeholder="0.00"
                className="w-full rounded-card border border-line bg-surface py-3 pl-9 pr-4 text-[20px] font-semibold tabular-nums text-fg outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
                style={{ minHeight: "56px" }}
              />
            </div>
          </label>
        </div>
      );

    case "WAITING_PAYMENT":
      return (
        <ChoiceGroup legend="How is the customer paying?">
          {PAYMENT_METHODS.map(option => (
            <Choice
              key={option}
              type="radio"
              name="payment_method"
              label={option}
              selected={formState.payment === option}
              onToggle={() => {
                formState.payment = option;
                tick();
              }}
            />
          ))}
        </ChoiceGroup>
      );

    case "WAITING_CLIENT_CONFIRMATION":
      return (
        <div className="flex flex-col items-center gap-2.5 rounded-card border border-line bg-surface px-4 py-6 text-center">
          <span className="grid size-11 place-items-center rounded-pill bg-brand-subtle text-brand">
            <PenLine className="size-5" aria-hidden />
          </span>
          <p className="text-heading text-fg">Hand your phone to the customer</p>
          <p className="max-w-xs text-body text-fg-muted">
            They'll read the confirmation and sign to accept the completed move.
          </p>
        </div>
      );

    case "WAITING_REVIEW_CHECK":
    case "WAITING_REVIEW_SEND":
      return null; // dock only

    case "COMPLETED":
      return null; // the screen renders <CompletionSummary> above

    default:
      return (
        <div className="rounded-card bg-surface-sunken px-4 py-4">
          <p className="text-body text-fg-muted">
            This job is at a step this version of the app doesn't recognise ({state}). Call the office before
            continuing.
          </p>
        </div>
      );
  }
}

function ReadyCard({ job }: { job: Job }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body text-fg-muted">Booked price</span>
        <span className="text-heading font-bold tabular-nums text-fg">£{(job.basePrice ?? 0).toFixed(2)}</span>
      </div>
      <div className="h-px bg-line" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-body text-fg-muted">Crew</span>
        <span className="text-card text-fg">{job.crewSize || "?"}</span>
      </div>
      {job.paidOnline && (
        <div className="flex items-center gap-2 rounded-control bg-success-subtle px-3 py-2.5 text-label font-medium text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Already paid online — don't collect payment on site.
        </div>
      )}
    </div>
  );
}

function InProgressCard({ job }: { job: Job }) {
  const started = job.actualStart
    ? new Date(job.actualStart).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: LONDON
      })
    : null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-4">
      <div>
        <p className="text-eyebrow uppercase text-fg-subtle">Started at</p>
        <p className="mt-0.5 text-title tabular-nums text-fg">{started ?? "—"}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-success-subtle px-3 py-1.5 text-meta font-bold uppercase tracking-[0.04em] text-success">
        <span className="size-2 rounded-pill bg-success motion-safe:animate-pulse" aria-hidden />
        Running
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------- step dock ---- */

interface StepDockProps {
  state: string;
  /** Whether the Overtime step is part of this job's workflow. */
  overtime: boolean;
  busy: boolean;
  online: boolean;
  uploadProgress: number | null;
  onStart: () => void;
  onAction: (action: string, input?: Record<string, string[]>, message?: string) => void;
  onUploadPhotos: (files: File[]) => void;
  onOpenSignature: () => void;
  onBackHome: () => void;
  onBlocked: (reason: string) => void;
}

/**
 * The primary action for every step, pinned to the bottom of the screen.
 *
 * Every button here carries a `blockedReason` rather than being disabled. The old
 * forms greyed out the submit and said nothing, so a driver who'd missed one field
 * just saw a dead button; worse, the signature step's button *looked* enabled and
 * silently returned. Now the button always responds, and if it can't proceed it says
 * exactly what's missing.
 */
function StepDock({
  state,
  overtime,
  busy,
  online,
  uploadProgress,
  onStart,
  onAction,
  onUploadPhotos,
  onOpenSignature,
  onBackHome,
  onBlocked
}: StepDockProps) {
  const offlineReason = !online ? "You're offline — reconnect to submit this step." : undefined;

  switch (state) {
    case "READY":
      return (
        <BottomActionBar>
          <Button
            fullWidth
            size="lg"
            loading={busy}
            blockedReason={offlineReason}
            onBlocked={onBlocked}
            onClick={onStart}
          >
            {busy ? "Starting…" : "Start job"}
          </Button>
        </BottomActionBar>
      );

    case "WAITING_ARRIVAL_PHOTO":
    case "WAITING_LOADED_PHOTO":
    case "WAITING_EMPTY_VAN_PHOTO":
      return (
        <BottomActionBar>
          <Button
            fullWidth
            size="lg"
            loading={busy}
            blockedReason={offlineReason ?? (formState.photos.length === 0 ? "Take a photo first." : undefined)}
            onBlocked={onBlocked}
            onClick={() => onUploadPhotos(formState.photos)}
          >
            {busy
              ? uploadProgress !== null
                ? `Uploading ${Math.round(uploadProgress * 100)}%`
                : "Uploading…"
              : formState.photos.length > 1
                ? `Upload ${formState.photos.length} photos`
                : "Upload photo"}
          </Button>
        </BottomActionBar>
      );

    case "WAITING_ARRIVAL_ISSUES_CHECK":
    case "WAITING_EMPTY_VAN_ISSUES_CHECK":
      return (
        <BottomActionBar>
          <IssueDecision
            busy={busy}
            onNone={() => onAction("ISSUES_NONE")}
            onYes={() => onAction("ISSUES_YES")}
          />
        </BottomActionBar>
      );

    case "IN_PROGRESS":
      return (
        <BottomActionBar>
          <Button
            fullWidth
            size="lg"
            loading={busy}
            blockedReason={offlineReason}
            onBlocked={onBlocked}
            onClick={() => onAction("FINISH_MOVE", undefined, "Move finished")}
          >
            {busy ? "Finishing…" : "Finish move"}
          </Button>
        </BottomActionBar>
      );

    case "WAITING_EXTRA_CHARGES":
      return (
        <BottomActionBar>
          <Button
            fullWidth
            size="lg"
            loading={busy}
            blockedReason={
              offlineReason ??
              (formState.extraCharges.length === 0
                ? `Choose at least one — pick “${NO_EXTRAS}” if there were none.`
                : undefined)
            }
            onBlocked={onBlocked}
            onClick={() => onAction("SUBMIT_EXTRA_CHARGES", { extra_charges: formState.extraCharges })}
          >
            Continue
          </Button>
        </BottomActionBar>
      );

    case "WAITING_OVERTIME":
      // Mirrors StepBody: no dock while the screen auto-skips an Overtime step that
      // doesn't apply to this job.
      if (!overtime) return null;
      return (
        <BottomActionBar>
          <Button
            fullWidth
            size="lg"
            loading={busy}
            blockedReason={
              offlineReason ??
              (formState.overtimeMinutes.trim() === ""
                ? "Enter the overtime minutes — use 0 if there was none."
                : Number(formState.overtimeMinutes) < 0 || Number.isNaN(Number(formState.overtimeMinutes))
                  ? "Overtime must be a number of minutes."
                  : undefined)
            }
            onBlocked={onBlocked}
            onClick={() =>
              onAction("SUBMIT_OVERTIME", {
                overtime_minutes: [formState.overtimeMinutes],
                overtime_crew_size: [formState.overtimeCrew]
              })
            }
          >
            Continue
          </Button>
        </BottomActionBar>
      );

    case "WAITING_TOTAL_CHARGES": {
      const parsed = Number(formState.total.replace(/[£,\s]/g, ""));
      return (
        <BottomActionBar>
          <Button
            fullWidth
            size="lg"
            loading={busy}
            blockedReason={
              offlineReason ??
              (formState.total.trim() === ""
                ? "Enter the total charged."
                : Number.isNaN(parsed) || parsed < 0
                  ? "That total isn't a valid amount."
                  : undefined)
            }
            onBlocked={onBlocked}
            onClick={() => onAction("SUBMIT_TOTAL_CHARGES", { total_charges: [String(parsed.toFixed(2))] })}
          >
            Continue
          </Button>
        </BottomActionBar>
      );
    }

    case "WAITING_PAYMENT":
      return (
        <BottomActionBar>
          <Button
            fullWidth
            size="lg"
            loading={busy}
            blockedReason={offlineReason ?? (!formState.payment ? "Choose a payment method." : undefined)}
            onBlocked={onBlocked}
            onClick={() => onAction("SUBMIT_PAYMENT", { payment_method: [formState.payment] })}
          >
            Continue
          </Button>
        </BottomActionBar>
      );

    case "WAITING_CLIENT_CONFIRMATION":
      return (
        <BottomActionBar>
          <Button
            fullWidth
            size="lg"
            iconLeft={<PenLine />}
            blockedReason={offlineReason}
            onBlocked={onBlocked}
            onClick={onOpenSignature}
          >
            Get customer signature
          </Button>
        </BottomActionBar>
      );

    case "WAITING_REVIEW_CHECK":
      return (
        <BottomActionBar>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => onAction("REVIEW_NONE")}>
              No thanks
            </Button>
            <Button size="lg" loading={busy} onClick={() => onAction("REVIEW_YES")}>
              Yes, ask
            </Button>
          </div>
        </BottomActionBar>
      );

    case "WAITING_REVIEW_SEND":
      return (
        <BottomActionBar>
          <Button
            fullWidth
            size="lg"
            loading={busy}
            blockedReason={offlineReason}
            onBlocked={onBlocked}
            onClick={() => onAction("SEND_REVIEW_EMAIL", undefined, "Review email sent")}
          >
            {busy ? "Sending…" : "Send review email & finish"}
          </Button>
        </BottomActionBar>
      );

    case "COMPLETED":
      return (
        <BottomActionBar>
          <Button fullWidth size="lg" onClick={onBackHome}>
            Back to your jobs
          </Button>
        </BottomActionBar>
      );

    default:
      return null;
  }
}

// Fallback shown until the job detail response's confirmationText loads. Reads the
// same Settings key the admin dashboard already edits.
const DEFAULT_CUSTOMER_CONFIRMATION_TEXT =
  "By signing below, you confirm that you have inspected the van, that it is empty, that all items have been " +
  "delivered, and that no items have been left behind. You also confirm that the removal service has been " +
  "completed to your satisfaction.";
