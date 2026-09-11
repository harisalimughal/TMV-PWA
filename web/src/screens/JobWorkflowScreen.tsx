import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Car,
  Check,
  FileWarning,
  PenLine
} from "lucide-react";
import {
  deleteEvidence,
  fetchJobDetail,
  type EvidenceItem,
  type JobUpdateResult,
  sendAction,
  startJob,
  uploadEvidencePhotos,
  uploadSignature,
  type ApiError,
  type Job
} from "../api/jobs";
import { PhotoUploader } from "../components/PhotoUploader";
import type { RemotePhoto } from "../components/PhotoPicker";
import type { PhotoCaptureMeta } from "../lib/geo";
import { SignatureModal } from "../components/SignatureModal";
import { Choice, ChoiceGroup } from "../components/ui/Choice";
import { useToast } from "../components/ui/Toast";
import { AppShell } from "../app/AppShell";
import { Alert, BottomActionBar, Button, cx, Field, Input, PageHeader, Select, Skeleton, Textarea } from "../ui";
import {
  AnimatedSuccessTick,
  BookingText,
  CompletionSummary,
  IssueChoiceCard,
  IssueDecision,
  bigActionButtonClass,
  JobHeader,
  JobProgress,
  RouteCard,
  WarningNotice
} from "../components/driver";
import { ScenarioFormScreen } from "./ScenarioFormScreen";
import { useOnline } from "../lib/net";
import { haptics } from "../lib/haptics";
import { htmlToPlainText } from "../lib/htmlText";
import type { ScenarioKey } from "../scenarioSpec";
import {
  CONGESTION_CHARGE,
  EXTRA_CHARGE_OPTIONS,
  NO_EXTRAS,
  overtimeApplies,
  PAYMENT_METHODS,
  STEPS,
  TUNNEL_CHARGE,
  workflowProgress
} from "./workflow/steps";

interface JobWorkflowScreenProps {
  jobId: string;
  onBack: () => void;
}

const LONDON = "Europe/London";

/** Steps whose heading block reads left-aligned rather than the default centered --
 *  the everyday data-entry steps, not the big "you've reached a checkpoint" moments. */
const LEFT_ALIGNED_STEPS = new Set(["WAITING_PAYMENT", "WAITING_EMPTY_VAN_PHOTO"]);

/** Steps whose hint line reads as an urgent red flag rather than quiet grey helper
 *  text -- both are "pay attention, this affects the money" moments. */
const RED_HINT_STEPS = new Set(["WAITING_OVERTIME", "WAITING_EMPTY_VAN_PHOTO"]);

/** The near-final "you're basically done" moment — a bigger heading than every
 *  other step's, to read as the celebratory beat it is. */
const LARGE_TITLE_STEPS = new Set(["WAITING_REVIEW_CHECK"]);

const ISSUE_SCENARIOS = ["parking", "liability"] as const;

type IssueScenario = (typeof ISSUE_SCENARIOS)[number];

function isIssueScenario(scenario: ScenarioKey): scenario is IssueScenario {
  return (ISSUE_SCENARIOS as readonly ScenarioKey[]).includes(scenario);
}

function otherIssueScenario(scenario: IssueScenario): IssueScenario {
  return scenario === "parking" ? "liability" : "parking";
}

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

function timeOfDay(d: Date): { hm: string; period: "am" | "pm" } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: LONDON
  }).formatToParts(d);
  const hour = parts.find(p => p.type === "hour")?.value ?? "";
  const minute = parts.find(p => p.type === "minute")?.value ?? "00";
  const period = (parts.find(p => p.type === "dayPeriod")?.value ?? "").toLowerCase().startsWith("p") ? "pm" : "am";
  return { hm: `${hour}:${minute}`, period };
}

/** "Friday, September 11 · 4:00 – 9:00pm" -- read the same way Calendar's own event
 *  popup reads it, so the raw-booking block below feels like the same event the office
 *  sees, not a re-derived summary. Drops the start time's am/pm when it matches the
 *  end's, exactly like Calendar does. */
function formatCalendarWindow(bookedStart: string, bookedFinish: string): string {
  const start = bookedStart ? new Date(bookedStart) : null;
  if (!start || Number.isNaN(start.getTime())) return "";
  const datePart = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: LONDON
  }).format(start);
  const startT = timeOfDay(start);
  const finish = bookedFinish ? new Date(bookedFinish) : null;
  if (!finish || Number.isNaN(finish.getTime())) return `${datePart} · ${startT.hm}${startT.period}`;
  const finishT = timeOfDay(finish);
  const startLabel = startT.period === finishT.period ? startT.hm : `${startT.hm}${startT.period}`;
  return `${datePart} · ${startLabel} – ${finishT.hm}${finishT.period}`;
}

export function JobWorkflowScreen({ jobId, onBack }: JobWorkflowScreenProps) {
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [suggestedTotal, setSuggestedTotal] = useState(0);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [confirmationText, setConfirmationText] = useState(DEFAULT_CUSTOMER_CONFIRMATION_TEXT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [openScenario, setOpenScenario] = useState<ScenarioKey | null>(null);
  const [completedIssueScenarios, setCompletedIssueScenarios] = useState<IssueScenario[]>([]);
  const [issueCompletion, setIssueCompletion] = useState<{
    last: IssueScenario;
    completed: IssueScenario[];
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const online = useOnline();

  // A step's form value lives in the module-level `formState` object (see the note by
  // its declaration), which means mutating it re-renders nothing on its own. Every
  // handler that touches `formState` also calls `bumpForm`, which re-renders this
  // screen -- and with it BOTH the StepBody (the inputs) and the StepDock (the submit
  // button, which reads `formState` to decide whether it's still blocked). Without
  // this the docked button stayed frozen at whatever it was on first render: take the
  // arrival photo and the dock action never woke up.
  const [, setFormVersion] = useState(0);
  const bumpForm = useCallback(() => setFormVersion(v => v + 1), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJobDetail(jobId);
      setJob(result.job);
      setSuggestedTotal(result.suggestedTotal);
      setEvidenceItems(result.evidenceItems ?? []);
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
  const autoReviewSendFrom = useRef<string | null>(null);

  const openFirstIssueScenario = useCallback((scenario: ScenarioKey) => {
    if (isIssueScenario(scenario)) {
      setCompletedIssueScenarios([]);
      setIssueCompletion(null);
    }
    setOpenScenario(scenario);
  }, []);

  const openAdditionalIssueScenario = useCallback((scenario: IssueScenario) => {
    setOpenScenario(scenario);
  }, []);

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
    async (action: () => Promise<JobUpdateResult>, successMessage?: string): Promise<boolean> => {
      if (!online) {
        toast.error("You're offline. Reconnect to continue this job — nothing you've entered is lost.");
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await action();
        setJob(result.job);
        if (typeof result.suggestedTotal === "number") setSuggestedTotal(result.suggestedTotal);
        if (result.evidenceItems) setEvidenceItems(result.evidenceItems);
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

  const openIssueScenarioFromCheck = useCallback(
    async (scenario: IssueScenario) => {
      if (!job) return;
      const ok = await run(() => sendAction(job.jobId, "ISSUES_YES"));
      if (ok) openFirstIssueScenario(scenario);
    },
    [job, openFirstIssueScenario, run]
  );

  const cancelScenario = useCallback(() => {
    if (!job || !openScenario) {
      setOpenScenario(null);
      return;
    }

    const issueChoiceState =
      job.currentState === "WAITING_ARRIVAL_ISSUES_CHOICE" ||
      job.currentState === "WAITING_STOP_BY_ISSUES_CHOICE" ||
      job.currentState === "WAITING_EMPTY_VAN_ISSUES_CHOICE";

    setOpenScenario(null);
    if (isIssueScenario(openScenario) && issueChoiceState) {
      setIssueCompletion(null);
      setCompletedIssueScenarios([]);
      void run(() => sendAction(job.jobId, "GO_BACK"));
    }
  }, [job, openScenario, run]);

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

  useEffect(() => {
    if (!job || job.currentState !== "WAITING_REVIEW_SEND") {
      autoReviewSendFrom.current = null;
      return;
    }
    if (busy || !online || autoReviewSendFrom.current === job.jobId) return;
    autoReviewSendFrom.current = job.jobId;
    void run(() => sendAction(job.jobId, "SEND_REVIEW_EMAIL"), "Review email sent");
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
        job={{ customerName: job.customerName }}
        reportedAt={reportedAtForState(job.currentState, job)}
        onCancel={cancelScenario}
        onDone={() => {
          if (isIssueScenario(openScenario)) {
            const completed = completedIssueScenarios.includes(openScenario)
              ? completedIssueScenarios
              : [...completedIssueScenarios, openScenario];
            setCompletedIssueScenarios(completed);
            setIssueCompletion({ last: openScenario, completed });
            setOpenScenario(null);
            return;
          }
          setOpenScenario(null);
          void load();
        }}
      />
    );
  }

  if (issueCompletion) {
    return (
      <IssueCompletionScreen
        job={job}
        completion={issueCompletion}
        onBack={onBack}
        onOther={openAdditionalIssueScenario}
        onContinue={() => {
          setIssueCompletion(null);
          setCompletedIssueScenarios([]);
          void load();
        }}
      />
    );
  }

  const state = job.currentState;
  const step = STEPS[state] ?? { label: state, order: 1 };
  const complete = state === "COMPLETED";

  // Photos already uploaded for the photo step being shown — surfaced so a driver who
  // stepped back to it sees them and can delete any before continuing.
  const stepEvidenceType = evidenceTypeForState(state);
  const stepRemotePhotos = stepEvidenceType
    ? evidenceItems
        .filter(item => item.evidenceType === stepEvidenceType)
        .map(item => ({
          id: item.evidenceId,
          url: item.url,
          capturedAt: item.capturedAt,
          location: item.location,
          locationName: item.locationName
        }))
    : [];

  const removeRemotePhoto = (evidenceId: string) => {
    if (!online) {
      toast.error("You're offline — reconnect to delete this photo.");
      return;
    }
    setBusy(true);
    deleteEvidence(job.jobId, evidenceId)
      .then(res => setEvidenceItems(res.evidenceItems))
      .catch((err: ApiError) => toast.error(err?.message || "Couldn't delete that photo."))
      .finally(() => setBusy(false));
  };

  const hasStop = Boolean(job.stopBy && job.stopBy.trim());
  const routeExpanded = state === "READY";
  // Every photo/issue-check step used to show a single-address reminder card (or, for
  // the money/sign-off steps, nothing) instead of the full route -- redundant now that
  // each photo already records exactly where it was taken (see the photo-capture-
  // location-time feature: PhotoUploader's caption, and the admin-side thumbnail
  // caption, both driven by real GPS, not a typed/selected address). The overview
  // route + Navigate button stays exactly where it always has: only on READY, as the
  // one "where am I going" reference before the job starts.
  const routeHidden = state !== "READY";

  // Does this job's workflow include the Overtime step? While the driver is still on
  // the Extra charges step their live checkbox selection is the freshest signal;
  // afterwards it's whatever the server recorded.
  const overtime =
    state === "WAITING_EXTRA_CHARGES"
      ? overtimeApplies(formState.extraCharges)
      : overtimeApplies(job.extraCharges);
  const progress = workflowProgress(state, { overtime, hasStop });
  // WAITING_ARRIVAL_PHOTO's own GO_BACK target is READY (see backend's BACK_TARGET) --
  // but READY is no longer a screen this app ever shows (see JobListScreen.tsx's
  // FeaturedJobCard, which replaced it). Walking back into it here would just
  // resurrect that eliminated view with a stale "I'm on my way" button. So the very
  // first step's back arrow skips the GO_BACK call entirely and returns straight to
  // the jobs list instead -- the job stays IN_PROGRESS/WAITING_ARRIVAL_PHOTO, and
  // tapping Start Job again there is a safe no-op that lands right back on this same
  // step (startJob is idempotent -- see jobs.service.ts).
  const canGoBackStep = state !== "READY" && state !== "COMPLETED" && state !== "WAITING_ARRIVAL_PHOTO";
  const handleWorkflowBack = () => {
    if (canGoBackStep) {
      void run(() => sendAction(job.jobId, "GO_BACK"));
      return;
    }
    onBack();
  };

  return (
    <>
      <AppShell
        contentRef={scrollRef}
        header={
          <JobHeader
            customerName={job.customerName}
            jobId={job.jobId}
            phone={job.customerPhone || undefined}
            onBack={handleWorkflowBack}
            backLabel={canGoBackStep ? "Previous step" : "Back to jobs"}
          />
        }
        dock={
          <StepDock
            state={state}
            overtime={overtime}
            invoice={isInvoiceJob(job)}
            busy={busy}
            online={online}
            uploadProgress={uploadProgress}
            photoRemoteCount={stepRemotePhotos.length}
            onStart={() => run(() => startJob(job.jobId), "Job started")}
            onAction={(action, input, message) => run(() => sendAction(job.jobId, action, input), message)}
            onUploadPhotos={async (files, metas) => {
              const submittedAt = job.currentState;
              const ok = await run(
                () => uploadEvidencePhotos(job.jobId, files, setUploadProgress, metas),
                "Photos uploaded"
              );
              // Once the server has them, drop the local staging for that step so a
              // later trip back doesn't re-submit the same files.
              if (ok) {
                delete formState.photosByStep[submittedAt];
                delete formState.photoMetaByStep[submittedAt];
              }
            }}
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
              <div className={LEFT_ALIGNED_STEPS.has(state) ? "text-left" : "text-center"}>
                <h1 className={cx(LARGE_TITLE_STEPS.has(state) ? "text-display" : "text-title", "text-fg")}>
                  {step.label}
                </h1>
                {step.hint && (
                  <p
                    className={cx(
                      "mt-1.5 text-body",
                      RED_HINT_STEPS.has(state) ? "font-semibold text-danger" : "text-fg-muted"
                    )}
                  >
                    {step.hint}
                  </p>
                )}
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

              {routeHidden ? null : (
                <RouteCard
                  pickup={job.pickup}
                  dropoff={job.dropoff}
                  stop={job.stopBy}
                  collapsible={!routeExpanded}
                />
              )}

              {error && <Alert tone="danger">{error}</Alert>}

              <StepBody
                job={job}
                state={state}
                busy={busy}
                uploadProgress={uploadProgress}
                error={error}
                suggestedTotal={suggestedTotal}
                confirmationText={confirmationText}
                remotePhotos={stepRemotePhotos}
                onRemoveRemotePhoto={removeRemotePhoto}
                onOpenScenario={openFirstIssueScenario}
                onReportIssue={openIssueScenarioFromCheck}
                onFormChange={bumpForm}
              />

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

function IssueCompletionScreen({
  job,
  completion,
  onBack,
  onOther,
  onContinue
}: {
  job: Job;
  completion: { last: IssueScenario; completed: IssueScenario[] };
  onBack: () => void;
  onOther: (scenario: IssueScenario) => void;
  onContinue: () => void;
}) {
  const other = otherIssueScenario(completion.last);
  const canReportOther = !completion.completed.includes(other);

  return (
    <AppShell
      header={
        <JobHeader
          customerName={job.customerName}
          jobId={job.jobId}
          phone={job.customerPhone || undefined}
          onBack={onBack}
        />
      }
      dock={
        <BottomActionBar>
          <div className="flex flex-col gap-3">
            {canReportOther && (
              <Button fullWidth size="lg" variant="secondary" onClick={() => onOther(other)}>
                Other liability Issues
              </Button>
            )}
            <Button fullWidth size="lg" onClick={onContinue}>
              Continue
            </Button>
          </div>
        </BottomActionBar>
      }
    >
      <div className="flex min-h-[calc(100dvh-12rem)] flex-col items-center justify-center px-6 py-8 text-center">
        <AnimatedSuccessTick />

        <h1 className="mt-7 text-title text-fg">
          Liability form has been successfully saved. Good job! 👍
        </h1>
        <p className="mt-2 max-w-sm text-body text-fg-muted">
          This confirms that it has been completed and recorded. The report and signature are saved
          against this job.
        </p>
        {canReportOther && (
          <p className="mt-4 max-w-sm text-body text-fg-muted">
            If there is another issue, use Other liability Issues before continuing.
          </p>
        )}
        <div className="scroll-pb-dock" aria-hidden />
      </div>
    </AppShell>
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
  payment: string[];
  photos: File[];
  /** Photos staged for each photo step, kept by workflow state so stepping away and
   *  back (GO_BACK / forward) restores exactly what the driver had taken and not yet
   *  submitted. `photos` above always mirrors the current step's entry. */
  photosByStep: Record<string, File[]>;
  /** Where/when each of `photos` was taken — parallel array, same per-step keying as
   *  photosByStep. */
  photoMeta: Array<PhotoCaptureMeta | null>;
  photoMetaByStep: Record<string, Array<PhotoCaptureMeta | null>>;
  totalChargesCorrect: "" | "yes" | "no";
  totalChargesAmount: string;
  totalChargesNote: string;
} = {
  extraCharges: [],
  overtimeMinutes: "",
  payment: [],
  photos: [],
  photosByStep: {},
  photoMeta: [],
  photoMetaByStep: {},
  totalChargesCorrect: "",
  totalChargesAmount: "",
  totalChargesNote: ""
};

function resetFormState() {
  formState.extraCharges = [];
  formState.overtimeMinutes = "";
  formState.payment = [];
  formState.photos = [];
  formState.photosByStep = {};
  formState.photoMeta = [];
  formState.photoMetaByStep = {};
  formState.totalChargesCorrect = "";
  formState.totalChargesAmount = "";
  formState.totalChargesNote = "";
}

/** Same sibling-sharing trick as `formState`: the photo steps render the uploader in
 *  <StepBody> but their "Take photo" button lives in <StepDock>. The uploader parks a
 *  camera-open trigger here; the dock button calls it. Cleared when the uploader
 *  unmounts (step change). */
const photoCapture: { open: (() => void) | null } = { open: null };

/** Max photos the current photo step accepts — the dock uses it to stop offering
 *  "Take photo" once the step is full. */
function photoMaxFor(state: string): number {
  return state === "WAITING_EMPTY_VAN_PHOTO" ? 1 : 2;
}

/** The server evidence type a photo step's photos belong to (so a driver stepping
 *  back to it sees the ones already uploaded). Null for non-photo steps. */
function evidenceTypeForState(state: string): string | null {
  switch (state) {
    case "WAITING_ARRIVAL_PHOTO":
      return "Arrival";
    case "WAITING_LOADED_PHOTO":
      return "VanLoaded";
    case "WAITING_EMPTY_VAN_PHOTO":
      return "EmptyVan";
    default:
      return null;
  }
}

/** Which checkpoint of the move a Parking Liability / Liability Report is being filed
 *  from, given the workflow state the moment the form opens — so the submission (and
 *  Parking Liability's address default) reflects where the driver actually is,
 *  including a stop-by / waypoint address, without asking them to say so themselves. */
function reportedAtForState(
  state: string,
  job: Pick<Job, "pickup" | "stopBy" | "dropoff">
): { label: "Pickup" | "Stop-by" | "Drop-off"; address?: string } | undefined {
  switch (state) {
    case "WAITING_ARRIVAL_ISSUES_CHOICE":
    case "WAITING_LOADED_PHOTO":
      return { label: "Pickup", address: job.pickup };
    case "WAITING_STOP_BY_ISSUES_CHOICE":
      return { label: "Stop-by", address: job.stopBy };
    case "WAITING_EMPTY_VAN_ISSUES_CHOICE":
      return { label: "Drop-off", address: job.dropoff };
    default:
      return undefined;
  }
}

/**
 * Whether this job is billed by invoice rather than collected on the day — signalled
 * by an "INV" tag after the "/" in the Calendar event title (the title's usual shape
 * is "<crew> Men - £<price> - <HH:mm> / <Y|N> - <initials>"; ops writes "INV" there
 * instead for an invoice job). The driver still logs extra charges and overtime as
 * normal — only the "confirm this total with the customer" step and cash/card
 * collection are skipped, since there's nothing to collect on site.
 *
 * NOTE: this reads the free-text Calendar title because there's no dedicated
 * invoice flag on the Job yet. If ops's actual "/ ... INV" wording turns out to
 * differ from this, loosen/tighten the regex to match it exactly.
 */
function isInvoiceJob(job: Job): boolean {
  return /\/[^/]*\bINV\b/i.test(job.rawTitle ?? "");
}

/** "Extra time / Charges, London Congestion charge · 90 min overtime (£67.50)" —
 *  what the driver logged on Extra charges / Overtime, recapped instead of a grand
 *  total on invoice jobs (nothing to collect on site, but the extras still matter for
 *  the invoice). Reads straight off `job` since both steps' SUBMIT_* actions have
 *  already saved to it by the time Total Charges / Payment are reached. */
function extrasSummary(job: Job): string {
  const parts = (job.extraCharges ?? []).filter(charge => charge !== NO_EXTRAS);
  const pieces = [...parts];
  if (job.overtimeMinutes > 0) {
    const charge = job.overtimeCharge > 0 ? ` (£${job.overtimeCharge.toFixed(2)})` : "";
    pieces.push(`${job.overtimeMinutes} min overtime${charge}`);
  }
  return pieces.length > 0 ? pieces.join(" · ") : "No extra charges added.";
}

/** 2h, 2.5h, 3h … 10h — the Overtime step's "longer than 90 minutes" dropdown. */
const OVERTIME_HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => 2 + i * 0.5);

function overtimeBlockedReason(offlineReason?: string): string | undefined {
  if (offlineReason) return offlineReason;
  if (formState.overtimeMinutes.trim() === "") {
    return "Enter the overtime minutes — use 0 if there was none.";
  }

  const minutes = Number(formState.overtimeMinutes);
  if (!Number.isFinite(minutes) || minutes < 0) {
    return "Overtime must be a number of minutes.";
  }

  return undefined;
}

function totalChargesBlockedReason(offlineReason?: string): string | undefined {
  if (offlineReason) return offlineReason;
  if (!formState.totalChargesCorrect) return "Choose whether the charges are correct.";
  if (formState.totalChargesCorrect === "yes") return undefined;

  const amount = Number(formState.totalChargesAmount);
  if (!formState.totalChargesAmount.trim() || !Number.isFinite(amount) || amount < 0) {
    return "Enter the custom final total amount.";
  }
  if (!formState.totalChargesNote.trim()) return "Add a reason for the adjustment.";
  return undefined;
}

function totalChargesInput(): Record<string, string[]> | undefined {
  if (formState.totalChargesCorrect !== "no") return undefined;
  return {
    total_charges: [formState.totalChargesAmount],
    total_adjustment_note: [formState.totalChargesNote.trim()]
  };
}

function StepBody({
  job,
  state,
  busy,
  uploadProgress,
  error,
  suggestedTotal,
  confirmationText,
  remotePhotos,
  onRemoveRemotePhoto,
  onOpenScenario,
  onReportIssue,
  onFormChange
}: {
  job: Job;
  state: string;
  busy: boolean;
  uploadProgress: number | null;
  error: string | null;
  suggestedTotal: number;
  /** The agreement the customer signs -- shown on WAITING_CLIENT_CONFIRMATION ahead
   *  of opening the signature pad, not just inside it. */
  confirmationText: string;
  /** Photos already uploaded for the current photo step (empty for other steps). */
  remotePhotos: RemotePhoto[];
  onRemoveRemotePhoto: (evidenceId: string) => void;
  onOpenScenario: (scenario: ScenarioKey) => void;
  onReportIssue: (scenario: IssueScenario) => void;
  onFormChange: () => void;
}) {
  // Re-renders the whole workflow screen -- not just this subtree -- so the docked
  // submit button sees the same `formState` change the inputs just made.
  const tick = onFormChange;

  // Stable across renders so <PhotoPicker>'s register effect doesn't re-run each tick.
  const registerPhotoCapture = useCallback((open: (() => void) | null) => {
    photoCapture.open = open;
  }, []);

  // Reset shared form state whenever the step changes, so values never leak from one
  // step to the next. Steps the driver can navigate back into (Extra charges,
  // Overtime) are re-seeded from what the server already recorded, so a return trip
  // shows their previous answers rather than a blank form — this is what lets them
  // *deselect* "Extra time / Charges" after having gone forward with it.
  useEffect(() => {
    formState.extraCharges = state === "WAITING_EXTRA_CHARGES" ? [...(job.extraCharges ?? [])] : [];
    formState.overtimeMinutes =
      state === "WAITING_OVERTIME" && job.overtimeMinutes ? String(job.overtimeMinutes) : "";
    // Invoice jobs (see isInvoiceJob) skip collecting payment on site -- Invoice is
    // pre-selected so the driver doesn't have to tap it themselves.
    formState.payment = state === "WAITING_PAYMENT" && isInvoiceJob(job) ? ["Invoice"] : [];
    // Photos are kept per step (see photosByStep) so returning to a photo step
    // restores what was taken there; only the mirror for the current step is set here.
    formState.photos = formState.photosByStep[state] ?? [];
    formState.photoMeta = formState.photoMetaByStep[state] ?? [];
    formState.totalChargesCorrect = "";
    formState.totalChargesAmount = state === "WAITING_TOTAL_CHARGES" ? suggestedTotal.toFixed(2) : "";
    formState.totalChargesNote = "";
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
          label="Proof of arrival pictures"
          maxPhotos={2}
          submitting={busy}
          progress={uploadProgress}
          error={error}
          registerCapture={registerPhotoCapture}
          initialFiles={formState.photosByStep[state] ?? []}
          initialMeta={formState.photoMetaByStep[state] ?? []}
          remoteFiles={remotePhotos}
          onRemoveRemote={onRemoveRemotePhoto}
          onFilesChange={(files, metas) => {
            formState.photos = files;
            formState.photosByStep[state] = files;
            formState.photoMeta = metas;
            formState.photoMetaByStep[state] = metas;
            tick();
          }}
        />
      );

    case "WAITING_LOADED_PHOTO":
      return (
        <div className="flex flex-col gap-4">
          <PhotoUploader
            key={state}
            label="Van Loaded Photo (pick up point)"
            hint="Up to 2 - show how the load is stacked and secured."
            maxPhotos={2}
            submitting={busy}
            progress={uploadProgress}
            error={error}
            registerCapture={registerPhotoCapture}
            initialFiles={formState.photosByStep[state] ?? []}
            initialMeta={formState.photoMetaByStep[state] ?? []}
            remoteFiles={remotePhotos}
            onRemoveRemote={onRemoveRemotePhoto}
            onFilesChange={(files, metas) => {
              formState.photos = files;
              formState.photosByStep[state] = files;
              formState.photoMeta = metas;
              formState.photoMetaByStep[state] = metas;
              tick();
            }}
          />

          <Button
            fullWidth
            size="lg"
            variant="secondary"
            iconLeft={<FileWarning aria-hidden />}
            onClick={() => onOpenScenario("liability")}
          >
            Other liability issues ?
          </Button>
        </div>
      );

    case "WAITING_EMPTY_VAN_PHOTO":
      return (
        <div className="flex flex-col gap-4">
          <PhotoUploader
            key={state}
            label="Empty Van Photo (Drop Off Point)"
            labelHidden
            hint="Please show that the van is completely empty, clean and organised. Make sure everything is clear and ready for the next customer and job. ✅"
            maxPhotos={1}
            submitting={busy}
            progress={uploadProgress}
            error={error}
            registerCapture={registerPhotoCapture}
            initialFiles={formState.photosByStep[state] ?? []}
            initialMeta={formState.photoMetaByStep[state] ?? []}
            remoteFiles={remotePhotos}
            onRemoveRemote={onRemoveRemotePhoto}
            onFilesChange={(files, metas) => {
              formState.photos = files;
              formState.photosByStep[state] = files;
              formState.photoMeta = metas;
              formState.photoMetaByStep[state] = metas;
              tick();
            }}
          />
        </div>
      );

    case "WAITING_ARRIVAL_ISSUES_CHECK":
      return (
        <div className="flex flex-col gap-3">
          <IssueChoiceCard
            icon={<Car aria-hidden />}
            title="Parking Liability"
            description="Restricted bay, red route, or anywhere a PCN could land. The customer accepts the charge."
            onClick={() => onReportIssue("parking")}
          />
          <IssueChoiceCard
            icon={<FileWarning aria-hidden />}
            title="Liability Report"
            description="Existing damage, item condition, access risk, or anything that needs evidence."
            onClick={() => onReportIssue("liability")}
          />
        </div>
      );

    case "WAITING_STOP_BY_ISSUES_CHECK":
      return (
        <div className="flex flex-col gap-3">
          <IssueChoiceCard
            icon={<Car aria-hidden />}
            title="Parking Liability"
            description="Restricted bay, red route, or anywhere a PCN could land. The customer accepts the charge."
            onClick={() => onReportIssue("parking")}
          />
          <IssueChoiceCard
            icon={<FileWarning aria-hidden />}
            title="Liability Report"
            description="Damage, unprotected items, or anything that needs evidence at the stop-by address."
            onClick={() => onReportIssue("liability")}
          />
        </div>
      );

    case "WAITING_EMPTY_VAN_ISSUES_CHECK":
      return (
        <div className="flex flex-col gap-3">
          <IssueChoiceCard
            icon={<Car aria-hidden />}
            title="Parking Liability"
            description="Restricted bay, red route, or anywhere a PCN could land. The customer accepts the charge."
            onClick={() => onReportIssue("parking")}
          />
          <IssueChoiceCard
            icon={<FileWarning aria-hidden />}
            title="Liability Report"
            description="Damage, unprotected items, or anything that needs evidence at the drop-off."
            onClick={() => onReportIssue("liability")}
          />
        </div>
      );

    case "WAITING_ARRIVAL_ISSUES_CHOICE":
    case "WAITING_STOP_BY_ISSUES_CHOICE":
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
        <div className="flex flex-col gap-4">
          {job.congestionZoneEnteredAt && (
            <Alert tone="info" title="Central London detected">
              This job passed through the Congestion Charge zone — consider adding "{CONGESTION_CHARGE}" below.
            </Alert>
          )}
          {job.tunnelZoneEnteredAt && (
            <Alert tone="info" title="Tunnel toll zone detected">
              This job passed through a tunnel toll zone — consider adding "{TUNNEL_CHARGE}" below.
            </Alert>
          )}
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
        </div>
      );

    case "WAITING_OVERTIME": {
      // Overtime only exists when "Extra time / Charges" was picked. If we're here
      // without it, the screen is mid auto-skip — render nothing rather than flash
      // the form.
      if (!overtimeApplies(job.extraCharges)) return null;

      // The hours dropdown mirrors formState.overtimeMinutes when it's a >=2h, on-the-
      // half-hour value (i.e. it was set by the dropdown, or matches one of its
      // options) -- otherwise (0-90 min, set by a chip) it shows its placeholder.
      const overtimeMinutesNum = Number(formState.overtimeMinutes);
      const dropdownValue =
        Number.isFinite(overtimeMinutesNum) && overtimeMinutesNum >= 120 && overtimeMinutesNum % 30 === 0
          ? String(overtimeMinutesNum)
          : "";

      return (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <span className="pl-0.5 text-label text-fg-muted">Overtime minutes</span>

            {/* Quick-pick chips: overtime is almost always a round number, and typing
                on a numeric keypad next to a van is slower than one tap. A fixed
                3-column grid keeps them a consistent, generous size, always 3 to a
                row, rather than wrapping at whatever width the labels happen to be. */}
            <div className="grid grid-cols-3 gap-2.5">
              {["0", "15", "30", "45", "60", "90"].map(value => (
                <button
                  key={value}
                  onClick={() => {
                    formState.overtimeMinutes = value;
                    tick();
                  }}
                  className={cx(
                    "min-h-tap rounded-pill border text-button transition-colors",
                    formState.overtimeMinutes === value
                      ? "border-brand bg-brand text-brand-fg"
                      : "border-line bg-surface text-fg-muted hover:bg-surface-sunken"
                  )}
                >
                  {value === "0" ? "None" : `${value} min`}
                </button>
              ))}
            </div>

            {/* Longer than 90 minutes: pick the nearest half hour instead of typing. */}
            <Select
              value={dropdownValue}
              placeholder="Longer? Pick the hours"
              className="min-h-control-lg text-[16px]"
              onChange={e => {
                formState.overtimeMinutes = e.target.value;
                tick();
              }}
            >
              {OVERTIME_HOUR_OPTIONS.map(hours => (
                <option key={hours} value={Math.round(hours * 60)}>
                  {hours} hours
                </option>
              ))}
            </Select>
          </div>
        </div>
      );
    }

    case "WAITING_TOTAL_CHARGES":
      if (isInvoiceJob(job)) {
        return (
          <div className="flex flex-col gap-4">
            <div className="rounded-card border border-brand-line bg-brand-subtle px-4 py-3.5">
              <p className="text-eyebrow uppercase text-brand-subtle-fg">Payment by Invoice</p>
              <p className="mt-1 text-body text-fg-muted">
                This job is billed by invoice — there's no total to confirm with the customer on site.
              </p>
            </div>
            <div className="rounded-card border border-line bg-surface px-4 py-3.5">
              <p className="text-eyebrow uppercase text-fg-subtle">Extra charges</p>
              <p className="mt-1 text-card text-fg">{extrasSummary(job)}</p>
            </div>
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-brand-line bg-brand-subtle px-4 py-3.5">
            <p className="text-eyebrow uppercase text-brand-subtle-fg">Total to charge</p>
            <p className="mt-0.5 text-display tabular-nums text-brand-subtle-fg">
              £{suggestedTotal.toFixed(2)}
            </p>
            <p className="mt-1 text-helper text-fg-muted">
              Base price plus the extras and overtime you entered.
            </p>
          </div>
          <ChoiceGroup legend="Are these charges correct?">
            <Choice
              type="radio"
              name="total_charges_correct"
              label="Yes"
              selected={formState.totalChargesCorrect === "yes"}
              onToggle={() => {
                formState.totalChargesCorrect = "yes";
                tick();
              }}
            />
            <Choice
              type="radio"
              name="total_charges_correct"
              label="No"
              selected={formState.totalChargesCorrect === "no"}
              onToggle={() => {
                formState.totalChargesCorrect = "no";
                tick();
              }}
            />
          </ChoiceGroup>
          {formState.totalChargesCorrect === "no" && (
            <div className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-3.5">
              <p className="text-heading text-fg">Custom Edit Price</p>
              <Field label="Final total amount" required>
                {control => (
                  <Input
                    {...control}
                    prefix="£"
                    inputMode="decimal"
                    value={formState.totalChargesAmount}
                    onChange={event => {
                      formState.totalChargesAmount = event.target.value;
                      tick();
                    }}
                  />
                )}
              </Field>
              <Field label="Reason/note for adjustment" required>
                {control => (
                  <Textarea
                    {...control}
                    rows={3}
                    value={formState.totalChargesNote}
                    onChange={event => {
                      formState.totalChargesNote = event.target.value;
                      tick();
                    }}
                  />
                )}
              </Field>
            </div>
          )}
        </div>
      );

    case "WAITING_PAYMENT":
      return (
        <div className="flex flex-col gap-4">
          <ChoiceGroup>
            {PAYMENT_METHODS.map(option => (
              <Choice
                key={option}
                type="checkbox"
                label={option}
                selected={formState.payment.includes(option)}
                onToggle={() => {
                  formState.payment = formState.payment.includes(option)
                    ? formState.payment.filter(value => value !== option)
                    : [...formState.payment, option];
                  tick();
                }}
              />
            ))}
          </ChoiceGroup>
          {/* Invoice jobs: Invoice is pre-selected (see the reset effect above) but
              the driver can still see/change it here; the extras recap is a reminder
              of what's actually going on the invoice. */}
          {isInvoiceJob(job) && (
            <p className="text-helper text-fg-subtle">
              <span className="font-semibold text-fg-muted">Extra charges: </span>
              {extrasSummary(job)}
            </p>
          )}
        </div>
      );

    case "WAITING_CLIENT_CONFIRMATION":
      return (
        <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-4 py-6">
          <span className="grid size-11 place-items-center rounded-pill bg-brand-subtle text-brand">
            <PenLine className="size-5" aria-hidden />
          </span>
          <p className="text-heading text-fg">Hand your phone to the customer</p>
          {/* The actual agreement they're signing -- shown up front here too, not
              just inside the signature pad, so they can read it before the driver
              even opens it. */}
          <p className="w-full whitespace-pre-wrap text-left text-body text-fg-muted">{confirmationText}</p>
        </div>
      );

    case "WAITING_REVIEW_CHECK":
      return (
        <div className="rounded-card border border-line bg-surface px-4 py-6 text-center">
          <p className="text-body text-fg">
            🎉 Congratulations! You've successfully completed another job. Great work! 💪🎊
          </p>
        </div>
      );

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

/** Placeholder for a detail the backend hasn't sent. */
const NO_VALUE = "—";

/**
 * The job exactly as booked -- title, window, and the full Calendar description
 * verbatim (see lib/htmlText.ts's htmlToPlainText). This used to sit below a set of
 * already-parsed summary rows (balance/crew/van/floors/...); those were dropped as
 * redundant with this and the route card above -- everything they showed is already
 * in here, in whatever words the office actually used, so there's nothing to keep in
 * sync between two versions of the same booking. Styled as the card's main content,
 * not a secondary block, since it's now the only thing here.
 */
function ReadyCard({ job }: { job: Job }) {
  const when = formatCalendarWindow(job.bookedStart, job.bookedFinish);
  const description = job.rawDescription ? htmlToPlainText(job.rawDescription) : "";

  if (!job.rawTitle && !description) {
    return (
      <div className="rounded-card border border-line bg-surface px-4 py-4">
        <p className="text-body text-fg-muted">{NO_VALUE} Booking details aren't in yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-surface px-4 py-4">
      {job.rawTitle && (
        <p className="text-title font-bold text-fg [overflow-wrap:anywhere]">{job.rawTitle}</p>
      )}
      {when && <p className="text-body text-fg-muted">{when}</p>}
      {description && <BookingText text={description} className="mt-3" />}
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
  /** Billed by invoice (see isInvoiceJob) — Total charges skips the confirm-with-
   *  customer step since there's nothing to show/collect on site. */
  invoice: boolean;
  busy: boolean;
  online: boolean;
  uploadProgress: number | null;
  /** Photos already uploaded for the current photo step — count toward the step max. */
  photoRemoteCount: number;
  onStart: () => void;
  onAction: (action: string, input?: Record<string, string[]>, message?: string) => void;
  onUploadPhotos: (files: File[], metas: Array<PhotoCaptureMeta | null>) => void;
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
  invoice,
  busy,
  online,
  uploadProgress,
  photoRemoteCount,
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
          <button
            type="button"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={() => {
              if (offlineReason) {
                haptics.warn();
                onBlocked(offlineReason);
                return;
              }
              haptics.tap();
              onStart();
            }}
            className={bigActionButtonClass}
          >
            {busy ? "Starting…" : "I'm on my way"}
            {!busy && <ArrowRight className="size-[22px]" aria-hidden />}
          </button>
        </BottomActionBar>
      );

    case "WAITING_ARRIVAL_PHOTO":
    case "WAITING_LOADED_PHOTO":
    case "WAITING_EMPTY_VAN_PHOTO": {
      // Local (just taken) + remote (already uploaded) photos both count toward the step.
      const photoTotal = formState.photos.length + photoRemoteCount;
      const photosFull = photoTotal >= photoMaxFor(state);
      return (
        <BottomActionBar>
          {/* Two equal, same-style buttons side by side: open the camera (left) +
              submit (right). */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              size="lg"
              className="!rounded-[10px]"
              iconLeft={<Camera aria-hidden />}
              disabled={busy || photosFull}
              onClick={() => photoCapture.open?.()}
            >
              {photoTotal === 0 ? "Take photo" : "Take another"}
            </Button>
            <Button
              size="lg"
              className="!rounded-[10px]"
              loading={busy}
              blockedReason={
                offlineReason ?? (photoTotal === 0 ? "Take a photo first." : undefined)
              }
              onBlocked={onBlocked}
              onClick={() => onUploadPhotos(formState.photos, formState.photoMeta)}
            >
              {busy
                ? uploadProgress !== null
                  ? `Continuing ${Math.round(uploadProgress * 100)}%`
                  : "Continuing..."
                : "Continue"}
            </Button>
          </div>
        </BottomActionBar>
      );
    }

    case "WAITING_ARRIVAL_ISSUES_CHECK":
    case "WAITING_STOP_BY_ISSUES_CHECK":
    case "WAITING_EMPTY_VAN_ISSUES_CHECK":
      return (
        <BottomActionBar>
          <Button
            fullWidth
            size="lg"
            variant="success"
            className="!rounded-[10px]"
            loading={busy}
            blockedReason={offlineReason}
            onBlocked={onBlocked}
            iconLeft={<Check aria-hidden />}
            onClick={() => onAction("ISSUES_NONE")}
          >
            No Issues
          </Button>
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
            blockedReason={overtimeBlockedReason(offlineReason)}
            onBlocked={onBlocked}
            onClick={() =>
              onAction("SUBMIT_OVERTIME", { overtime_minutes: [formState.overtimeMinutes] })
            }
          >
            Continue
          </Button>
        </BottomActionBar>
      );

    case "WAITING_TOTAL_CHARGES":
      return (
        <BottomActionBar>
          <Button
            fullWidth
            size="lg"
            loading={busy}
            // Invoice jobs have nothing to confirm -- there's no "is this correct?"
            // choice shown, so Continue is only ever blocked by being offline.
            blockedReason={invoice ? offlineReason : totalChargesBlockedReason(offlineReason)}
            onBlocked={onBlocked}
            onClick={() => onAction("SUBMIT_TOTAL_CHARGES", invoice ? undefined : totalChargesInput())}
          >
            Continue
          </Button>
        </BottomActionBar>
      );

    case "WAITING_PAYMENT":
      return (
        <BottomActionBar>
          <Button
            fullWidth
            size="lg"
            loading={busy}
            blockedReason={offlineReason ?? (formState.payment.length === 0 ? "Choose at least one payment method." : undefined)}
            onBlocked={onBlocked}
            onClick={() => onAction("SUBMIT_PAYMENT", { payment_method: formState.payment })}
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
      return null;

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
  "I confirm that the moving service has been completed and all my belongings have been unloaded. " +
  "I have checked the van and confirm that nothing has been left behind. By signing, I agree that the job " +
  "is complete and the team is released to leave. Any request to return after sign-off will be subject to " +
  "availability and additional charges.";
