import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowLeft, ChevronLeft, ClipboardList, Loader2, MapPin, PartyPopper, PenLine } from "lucide-react";
import {
  fetchJobDetail, sendAction, startJob, uploadEvidencePhotos, uploadSignature, type Job
} from "../api/jobs";
import { CameraCapture } from "../components/CameraCapture";
import { Modal } from "../components/Modal";
import { SignaturePad, type SignaturePadHandle } from "../components/SignaturePad";
import { ScenarioFormScreen } from "./ScenarioFormScreen";
import type { ScenarioKey } from "../scenarioSpec";

interface JobWorkflowScreenProps {
  jobId: string;
  onBack: () => void;
}

const EXTRA_CHARGE_OPTIONS = [
  "London Congestion charge",
  "Tunnel Charges",
  "Extra time / Charges",
  "Packing Service",
  "No Extras Time"
];

const PAYMENT_METHODS = ["Card", "Cash", "Bank Transfer", "Link", "Invoice"];

const CREW_SIZE_OPTIONS: Array<{ value: "1" | "2" | "3"; label: string }> = [
  { value: "1", label: "1 man" },
  { value: "2", label: "2 men" },
  { value: "3", label: "3 men" }
];

/** Pre-selects the job's booked crew size, but the driver can change it -- the crew
 * actually working the overtime period can differ from what was booked. */
function defaultOvertimeCrewSize(job: Job): "1" | "2" | "3" {
  if (job.crewSize === 1) return "1";
  if (job.crewSize === 3) return "3";
  return "2";
}

/** "yyyy-MM-dd" for a Date, as seen in Europe/London -- the operating timezone,
 * regardless of the device's own local timezone setting. A device set to a different
 * zone (seen in practice: +05:00) previously made isNotToday compare calendar days in
 * the WRONG timezone, e.g. an evening London booking rolling into "tomorrow" on a
 * device several hours ahead -- flagging today's own job as "not today". */
function londonDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
}

/** True when bookedStart isn't today in Europe/London -- flags a job opened a day
 * early (e.g. tapped from the "Tomorrow" list) so it isn't mistaken for today's work. */
function isNotToday(bookedStart: string): boolean {
  if (!bookedStart) return false;
  const booked = new Date(bookedStart);
  if (isNaN(booked.getTime())) return false;
  return londonDateKey(booked) !== londonDateKey(new Date());
}

function formatBookedDay(bookedStart: string): string {
  try {
    return new Date(bookedStart).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  } catch {
    return "";
  }
}

const BACK_ELIGIBLE = new Set([
  "WAITING_EXTRA_CHARGES", "WAITING_OVERTIME", "WAITING_TOTAL_CHARGES", "WAITING_PAYMENT"
]);

const STEP_LABEL: Record<string, string> = {
  READY: "Ready to start",
  WAITING_ARRIVAL_PHOTO: "Arrival photo",
  WAITING_ARRIVAL_ISSUES_CHECK: "Any issues on arrival?",
  WAITING_ARRIVAL_ISSUES_CHOICE: "Issue noted",
  WAITING_LOADED_PHOTO: "Van loaded photo",
  IN_PROGRESS: "Move in progress",
  WAITING_EMPTY_VAN_ISSUES_CHECK: "Any issues to report?",
  WAITING_EMPTY_VAN_ISSUES_CHOICE: "Issue noted",
  WAITING_EXTRA_CHARGES: "Extra charges",
  WAITING_OVERTIME: "Overtime",
  WAITING_TOTAL_CHARGES: "Total charges",
  WAITING_PAYMENT: "Payment method",
  WAITING_EMPTY_VAN_PHOTO: "Empty van photo",
  WAITING_CLIENT_CONFIRMATION: "Customer sign-off",
  WAITING_REVIEW_CHECK: "Ask for a review?",
  WAITING_REVIEW_SEND: "Send review email",
  COMPLETED: "Job complete"
};

export function JobWorkflowScreen({ jobId, onBack }: JobWorkflowScreenProps) {
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [suggestedTotal, setSuggestedTotal] = useState(0);
  const [confirmationText, setConfirmationText] = useState(DEFAULT_CUSTOMER_CONFIRMATION_TEXT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [openScenario, setOpenScenario] = useState<ScenarioKey | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJobDetail(jobId);
      setJob(result.job);
      setSuggestedTotal(result.suggestedTotal);
      if (result.confirmationText) setConfirmationText(result.confirmationText);
    } catch (err: any) {
      setError(err?.message || "Couldn't load this job.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  /** Returns whether the action succeeded -- the signature modal uses this to decide
   * whether to close itself (only on success; a failure should keep it open with the
   * error visible so the driver can retry without redrawing the signature). */
  async function run(action: () => Promise<{ job: Job }>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      setJob(result.job);
      return true;
    } catch (err: any) {
      setError(err?.message || "That didn't work. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="h-screen-safe flex items-center justify-center bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="h-screen-safe flex flex-col items-center justify-center gap-4 bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe px-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-white/60">{error || "This job couldn't be found."}</p>
        <button onClick={onBack} className="text-sm text-brand">Back to jobs</button>
      </div>
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
          load();
        }}
      />
    );
  }

  const state = job.currentState;

  return (
    <div className="h-screen-safe flex flex-col bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10 shrink-0">
        <button onClick={onBack} className="text-white/60 hover:text-white/90 p-1 -ml-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{job.customerName || "Unnamed customer"}</div>
          <div className="text-xs text-white/40 truncate">{job.pickup || "Pickup TBC"}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <h1 className="text-lg font-bold mb-1">{STEP_LABEL[state] ?? state}</h1>
        <p className="text-xs text-white/40 mb-4">Job {job.jobId}</p>

        {isNotToday(job.bookedStart) && (
          <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            This job is booked for {formatBookedDay(job.bookedStart)} -- not today.
          </div>
        )}

        <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3.5 mb-4 flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <MapPin className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
            <div className="min-w-0 text-sm text-white/90">
              <span className="font-semibold">Pickup:</span> {job.pickup || "Not recorded"}
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <MapPin className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
            <div className="min-w-0 text-sm text-white/90">
              <span className="font-semibold">Drop-off:</span> {job.dropoff || "Not recorded"}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-3 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <StepBody
          job={job}
          state={state}
          suggestedTotal={suggestedTotal}
          busy={busy}
          onStart={() => run(() => startJob(job.jobId))}
          onUploadPhotos={files => run(() => uploadEvidencePhotos(job.jobId, files))}
          onAction={(action, input) => run(() => sendAction(job.jobId, action, input))}
          onOpenSignature={() => setSignatureModalOpen(true)}
          onOpenScenario={setOpenScenario}
        />

        {BACK_ELIGIBLE.has(state) && (
          <button
            onClick={() => run(() => sendAction(job.jobId, "GO_BACK"))}
            disabled={busy}
            className="mt-4 flex items-center gap-1 text-xs text-white/40 hover:text-white/70 disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Go back a step
          </button>
        )}

        {/* Check In/Check Out are standalone storage-job actions, not part of the
            linear move workflow above -- always reachable regardless of job state. */}
        <div className="mt-8 pt-5 border-t border-white/10">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">
            <ClipboardList className="w-3.5 h-3.5" />
            Storage forms
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setOpenScenario("checkin")}
              className="flex-1 rounded-xl border border-white/15 py-3 text-sm font-medium hover:border-white/30"
            >
              Check In
            </button>
            <button
              onClick={() => setOpenScenario("checkout")}
              className="flex-1 rounded-xl border border-white/15 py-3 text-sm font-medium hover:border-white/30"
            >
              Check Out
            </button>
          </div>
        </div>
      </div>

      {signatureModalOpen && (
        <Modal title="Customer sign-off" onClose={() => setSignatureModalOpen(false)}>
          <SignatureForm
            customerName={job.customerName}
            confirmationText={confirmationText}
            busy={busy}
            onSubmit={async (name, blob) => {
              const ok = await run(() => uploadSignature(job.jobId, name, blob));
              if (ok) setSignatureModalOpen(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

interface StepBodyProps {
  job: Job;
  state: string;
  suggestedTotal: number;
  busy: boolean;
  onStart: () => void;
  onUploadPhotos: (files: File[]) => void;
  onAction: (action: string, input?: Record<string, string[]>) => void;
  onOpenSignature: () => void;
  onOpenScenario: (scenario: ScenarioKey) => void;
}

function StepBody({
  job, state, suggestedTotal, busy, onStart, onUploadPhotos, onAction, onOpenSignature, onOpenScenario
}: StepBodyProps) {
  switch (state) {
    case "READY":
      return (
        <PrimaryButton busy={busy} onClick={onStart}>
          Start job
        </PrimaryButton>
      );

    case "WAITING_ARRIVAL_PHOTO":
      return <CameraCapture label="arrival" maxPhotos={1} submitting={busy} onSubmit={onUploadPhotos} />;

    case "WAITING_LOADED_PHOTO":
      return <CameraCapture label="van-loaded" maxPhotos={2} submitting={busy} onSubmit={onUploadPhotos} />;

    case "WAITING_EMPTY_VAN_PHOTO":
      return <CameraCapture label="empty-van" maxPhotos={1} submitting={busy} onSubmit={onUploadPhotos} />;

    case "WAITING_ARRIVAL_ISSUES_CHECK":
    case "WAITING_EMPTY_VAN_ISSUES_CHECK":
      return (
        <YesNo
          busy={busy}
          question="Any issues to report before continuing?"
          onYes={() => onAction("ISSUES_YES")}
          onNo={() => onAction("ISSUES_NONE")}
        />
      );

    case "WAITING_ARRIVAL_ISSUES_CHOICE":
    case "WAITING_EMPTY_VAN_ISSUES_CHOICE":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-white/60">Document the issue with the relevant form -- the job resumes automatically once it's submitted.</p>
          <button
            onClick={() => onOpenScenario("parking")}
            className="rounded-xl border border-white/15 px-4 py-3.5 text-sm font-semibold text-left hover:border-white/30"
          >
            Parking Liability
          </button>
          <button
            onClick={() => onOpenScenario("liability")}
            className="rounded-xl border border-white/15 px-4 py-3.5 text-sm font-semibold text-left hover:border-white/30"
          >
            Liability Report
          </button>
        </div>
      );

    case "IN_PROGRESS":
      return (
        <PrimaryButton busy={busy} onClick={() => onAction("FINISH_MOVE")}>
          Finish move
        </PrimaryButton>
      );

    case "WAITING_EXTRA_CHARGES":
      return <ExtraChargesForm busy={busy} onSubmit={values => onAction("SUBMIT_EXTRA_CHARGES", { extra_charges: values })} />;

    case "WAITING_OVERTIME":
      return (
        <OvertimeForm
          job={job}
          busy={busy}
          onSubmit={(minutes, crewSize) =>
            onAction("SUBMIT_OVERTIME", { overtime_minutes: [minutes], overtime_crew_size: [crewSize] })
          }
        />
      );

    case "WAITING_TOTAL_CHARGES":
      return (
        <TotalChargesForm
          busy={busy}
          suggestedTotal={suggestedTotal}
          onSubmit={total => onAction("SUBMIT_TOTAL_CHARGES", { total_charges: [total] })}
        />
      );

    case "WAITING_PAYMENT":
      return <PaymentForm busy={busy} onSubmit={method => onAction("SUBMIT_PAYMENT", { payment_method: [method] })} />;

    case "WAITING_CLIENT_CONFIRMATION":
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-white/60">
            Hand your phone to the customer to review and sign off on the completed move.
          </p>
          <PrimaryButton busy={false} onClick={onOpenSignature}>
            <PenLine className="w-4 h-4" />
            Get customer signature
          </PrimaryButton>
        </div>
      );

    case "WAITING_REVIEW_CHECK":
      return (
        <YesNo
          busy={busy}
          question="Would the customer like to leave a review?"
          onYes={() => onAction("REVIEW_YES")}
          onNo={() => onAction("REVIEW_NONE")}
        />
      );

    case "WAITING_REVIEW_SEND":
      return (
        <PrimaryButton busy={busy} onClick={() => onAction("SEND_REVIEW_EMAIL")}>
          Send review email & complete
        </PrimaryButton>
      );

    case "COMPLETED":
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <PartyPopper className="w-10 h-10 text-emerald-400" />
          <p className="text-base font-semibold">Job complete</p>
          <p className="text-sm text-white/50 max-w-xs">Nice work -- this job is done and the customer has been notified.</p>
        </div>
      );

    default:
      return <p className="text-sm text-white/50">Unrecognised step: {state}</p>;
  }
}

function PrimaryButton({ children, busy, onClick }: { children: React.ReactNode; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-dark transition-colors py-3.5 text-sm font-semibold disabled:opacity-50"
    >
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

function YesNo({ question, busy, onYes, onNo }: { question: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-white/70">{question}</p>
      <div className="flex gap-3">
        <button
          onClick={onNo}
          disabled={busy}
          className="flex-1 rounded-xl border border-white/15 py-3.5 text-sm font-semibold hover:border-white/30 disabled:opacity-50"
        >
          No
        </button>
        <button
          onClick={onYes}
          disabled={busy}
          className="flex-1 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 py-3.5 text-sm font-semibold hover:bg-amber-500/30 disabled:opacity-50"
        >
          Yes
        </button>
      </div>
    </div>
  );
}

function ExtraChargesForm({ busy, onSubmit }: { busy: boolean; onSubmit: (values: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(option: string) {
    if (option === "No Extras Time") {
      setSelected(prev => (prev.includes(option) ? [] : [option]));
      return;
    }
    setSelected(prev => {
      const withoutNone = prev.filter(v => v !== "No Extras Time");
      return withoutNone.includes(option) ? withoutNone.filter(v => v !== option) : [...withoutNone, option];
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-white/60">Select every extra charge that applies to this job.</p>
      <div className="flex flex-col gap-2">
        {EXTRA_CHARGE_OPTIONS.map(option => (
          <label
            key={option}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 cursor-pointer transition-colors ${
              selected.includes(option) ? "bg-brand/15 border-brand" : "bg-white/5 border-white/10"
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => toggle(option)}
              className="w-4 h-4 accent-[#1B75BC]"
            />
            <span className="text-sm">{option}</span>
          </label>
        ))}
      </div>
      <PrimaryButton busy={busy} onClick={() => onSubmit(selected)}>
        Continue
      </PrimaryButton>
    </div>
  );
}

function OvertimeForm({
  job, busy, onSubmit
}: { job: Job; busy: boolean; onSubmit: (minutes: string, crewSize: string) => void }) {
  const [minutes, setMinutes] = useState("");
  const [crewSize, setCrewSize] = useState<"1" | "2" | "3">(defaultOvertimeCrewSize(job));
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-white/60 pl-1">Overtime minutes</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={minutes}
          onChange={e => setMinutes(e.target.value)}
          placeholder="e.g. 30"
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-white/60 pl-1">Crew size for this overtime</span>
        <div className="flex flex-col gap-2">
          {CREW_SIZE_OPTIONS.map(option => (
            <label
              key={option.value}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 cursor-pointer transition-colors ${
                crewSize === option.value ? "bg-brand/15 border-brand" : "bg-white/5 border-white/10"
              }`}
            >
              <input
                type="radio"
                name="overtime_crew_size"
                checked={crewSize === option.value}
                onChange={() => setCrewSize(option.value)}
                className="w-4 h-4 accent-[#1B75BC]"
              />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      <PrimaryButton busy={busy} onClick={() => onSubmit(minutes, crewSize)}>
        Continue
      </PrimaryButton>
    </div>
  );
}

function TotalChargesForm({
  busy, suggestedTotal, onSubmit
}: { busy: boolean; suggestedTotal: number; onSubmit: (total: string) => void }) {
  const [total, setTotal] = useState(suggestedTotal ? String(suggestedTotal) : "");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-white/40">Suggested total: £{suggestedTotal.toFixed(2)}</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-white/60 pl-1">Total charges (£)</span>
        <input
          type="text"
          inputMode="decimal"
          value={total}
          onChange={e => setTotal(e.target.value)}
          placeholder="e.g. 196.00"
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand"
        />
      </label>
      <PrimaryButton busy={busy} onClick={() => onSubmit(total)}>
        Continue
      </PrimaryButton>
    </div>
  );
}

function PaymentForm({ busy, onSubmit }: { busy: boolean; onSubmit: (method: string) => void }) {
  const [method, setMethod] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {PAYMENT_METHODS.map(option => (
          <label
            key={option}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 cursor-pointer transition-colors ${
              method === option ? "bg-brand/15 border-brand" : "bg-white/5 border-white/10"
            }`}
          >
            <input
              type="radio"
              name="payment_method"
              checked={method === option}
              onChange={() => setMethod(option)}
              className="w-4 h-4 accent-[#1B75BC]"
            />
            <span className="text-sm">{option}</span>
          </label>
        ))}
      </div>
      <PrimaryButton busy={busy} onClick={() => onSubmit(method)}>
        Continue
      </PrimaryButton>
    </div>
  );
}

function SignatureForm({
  customerName, confirmationText, busy, onSubmit
}: { customerName: string; confirmationText: string; busy: boolean; onSubmit: (customerName: string, blob: Blob) => void }) {
  const [hasSignature, setHasSignature] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  async function handleSubmit() {
    const blob = await padRef.current?.toBlob();
    if (!blob) return;
    // The customer's name is already known from the booking -- no need to ask the
    // driver to retype it here.
    onSubmit(customerName, blob);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-white/50 leading-relaxed">{confirmationText}</p>
      <SignaturePad ref={padRef} onChange={setHasSignature} />
      <PrimaryButton
        busy={busy}
        onClick={() => {
          if (!hasSignature) return;
          handleSubmit();
        }}
      >
        Confirm & continue
      </PrimaryButton>
    </div>
  );
}

// Fallback shown until the job detail response's confirmationText loads (see
// backend/src/workflow/workflow.engine.ts's getConfirmationText -- reads the same
// Settings-sheet key TMV-Chat-bot's admin dashboard already edits).
const DEFAULT_CUSTOMER_CONFIRMATION_TEXT =
  "By signing below, you confirm that you have inspected the van, that it is empty, that all items have been " +
  "delivered, and that no items have been left behind. You also confirm that the removal service has been " +
  "completed to your satisfaction.";
