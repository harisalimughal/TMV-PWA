/**
 * Broadcast a push notice to drivers. Deliberate by design (audit p.19): compose,
 * then review the audience, recipient count and a preview, then confirm. Nothing is
 * sent until "Send now" on the review step.
 */
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDrivers } from "../../../../api/admin";
import { adminFetch } from "../../../../lib/adminTransport";
import { broadcastErrorMessage } from "../utils/broadcastError";
import { fetchJobDetail } from "../api";
import { DEFAULT_DESTINATION, destinationProblem } from "../utils/notificationDestination";
import { Bell } from "lucide-react";
import type { ComposeTarget } from "../activityLinks";
import { Modal } from "../../../../ui/Modal";
import { useToast } from "../../../../components/ui/Toast";
import { Action, Notice, controlBase } from "./ds";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Notify-driver mode: the audience is fixed to the job's one driver and cannot be changed to
   * "all drivers" here. It uses the same push endpoint as a broadcast, addressed to that driver only.
   */
  direct?: ComposeTarget;
  onSent?: () => void;
}

export function SendBroadcastPushModal({ isOpen, onClose, direct, onSent }: Props) {
  const toast = useToast();
  const [step, setStep] = useState<"compose" | "review">("compose");
  const [target, setTarget] = useState(direct?.driver ?? "all");
  const [title, setTitle] = useState(direct ? `Job Update — ${direct.jobId}` : "The Man Van Operations");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState(DEFAULT_DESTINATION);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const drivers = useQuery({ queryKey: ["broadcast_modal_drivers"], queryFn: () => fetchDrivers(), enabled: isOpen });
  if (!isOpen) return null;
  const active = (drivers.data ?? []).filter(driver => driver.active);
  const recipient = target === "all" ? null : active.find(driver => driver.initials === target);
  const audience = target === "all" ? `All ${active.length} active driver${active.length === 1 ? "" : "s"}` : `${recipient?.fullName || target} (${target})`;
  const urlProblem = destinationProblem(url);
  const titleProblem = title.trim() ? "" : "Enter a title.";
  const bodyProblem = body.trim() ? "" : "Enter the message.";
  const close = () => { if (!sending) { setStep("compose"); setError(""); onClose(); } };

  const send = async () => {
    if (sending) return; // one request per confirmation, however many times it is triggered
    setSending(true); setError("");
    try {
      if (direct) {
        // The job may have been reassigned since the conversation was opened: check the current assignment
        // and refuse rather than notify someone who is no longer on it.
        const job = await fetchJobDetail(direct.jobId).catch(() => null);
        if (!job) throw new Error("Couldn't confirm who is assigned to this job. Nothing was sent. Try again.");
        if (!job.driverInitials) throw new Error("This job has no assigned driver. Nothing was sent.");
        if (job.driverInitials !== direct.driver) throw new Error("This job was reassigned after you opened it. Go back to Activity and notify the current driver. Nothing was sent.");
      }
      const res = await adminFetch("/api/push/admin/broadcast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, url, driverInitials: direct ? direct.driver : target !== "all" ? target : undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(broadcastErrorMessage(data, "The notice could not be sent."));
      // The server reports only how many subscribed devices accepted the push. Zero is not a
      // success: say so and keep the message so it can be reviewed, instead of "sent".
      const sent = Number(data.result?.sent ?? 0);
      if (sent <= 0) { setError("The server accepted the notice, but no subscribed device received it. Drivers need to turn on notifications in the driver app first."); return; }
      toast.success(direct ? `Notification submitted successfully. ${sent} subscribed device${sent === 1 ? "" : "s"} of ${recipient?.fullName || direct.driver} accepted it.` : `Notification submitted successfully. ${sent} subscribed device${sent === 1 ? "" : "s"} accepted it.`);
      setStep("compose"); setBody(""); onClose(); onSent?.();
    } catch (err) {
      setError((err as Error)?.message || "The notice could not be sent.");
    } finally { setSending(false); }
  };

  return (
    <Modal open onClose={close} title={<span className="inline-flex items-center gap-2"><Bell aria-hidden className="h-5 w-5 text-admin-brand" />{step === "compose" ? "Send Push Notification" : "Review notification"}</span>} size="lg" placement="center" dismissible={!sending}
      footer={step === "compose" ? (
        <div className="flex justify-end gap-2"><Action variant="ghost" onClick={close}>Cancel</Action><Action variant="primary" disabled={drivers.isLoading} onClick={() => { setTouched(true); if (!titleProblem && !bodyProblem && !urlProblem) setStep("review"); }}>Review notice</Action></div>
      ) : (
        <div className="flex justify-between gap-2"><Action variant="ghost" onClick={() => setStep("compose")} disabled={sending}>Back to edit</Action><Action variant="primary" loading={sending} onClick={() => void send()}>Send Notification</Action></div>
      )}>
      {step === "compose" ? (
        <div className="space-y-3">
          <label className="block text-[13px] font-medium text-admin-ink-2">Recipient
            <select aria-label="Recipient" value={target} disabled={Boolean(direct)} onChange={event => setTarget(event.target.value)} className={`${controlBase} mt-1 w-full`}>
              {direct ? <option value={direct.driver}>{recipient?.fullName || direct.driver} ({direct.driver})</option>
                : <option value="all">{drivers.isLoading ? "Loading drivers…" : `Broadcast to all active drivers (${active.length})`}</option>}
              {!direct && active.map(driver => <option key={driver.initials} value={driver.initials}>{driver.fullName || driver.initials} ({driver.initials})</option>)}
            </select>
            {direct && <span className="mt-1 block text-[12.5px] font-normal text-admin-ink-2">About job {direct.jobId}. Only this driver is notified.</span>}
          </label>
          <label className="block text-[13px] font-medium text-admin-ink-2">Notification Title<input aria-label="Notification Title" value={title} onChange={event => setTitle(event.target.value)} maxLength={80} aria-invalid={touched && Boolean(titleProblem)} className={`${controlBase} mt-1 w-full`} />
            {touched && titleProblem && <span role="alert" className="mt-1 block text-[12.5px] font-normal text-admin-status-red">{titleProblem}</span>}</label>
          <label className="block text-[13px] font-medium text-admin-ink-2">Message Content<textarea aria-label="Message Content" value={body} rows={4} maxLength={240} placeholder="e.g. New jobs have been allocated for tomorrow. Please check your schedule." aria-invalid={touched && Boolean(bodyProblem)} onChange={event => setBody(event.target.value)} className="mt-1 w-full rounded-xl border border-admin-line bg-surface px-3 py-2 text-[14px] text-admin-ink outline-none transition focus:border-admin-brand focus:ring-2 focus:ring-admin-brand/20" />
            <span className="mt-1 flex justify-between text-[12.5px] font-normal"><span role={touched && bodyProblem ? "alert" : undefined} className="text-admin-status-red">{touched ? bodyProblem : ""}</span><span className="tabular-nums text-admin-muted">{body.length}/240</span></span></label>
          <label className="block text-[13px] font-medium text-admin-ink-2">Tap Destination URL<input aria-label="Tap Destination URL" value={url} onChange={event => setUrl(event.target.value)} aria-invalid={Boolean(urlProblem)} className={`${controlBase} mt-1 w-full font-mono text-[13px]`} />
            <span className={`mt-1 block text-[12.5px] font-normal ${urlProblem ? "text-admin-status-red" : "text-admin-ink-2"}`} role={urlProblem ? "alert" : undefined}>{urlProblem || "Where the driver lands after tapping the notification."}</span></label>
          {direct && error && <p role="alert" className="text-[13px] text-admin-status-red">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <dl className="grid gap-2 text-[14px] sm:grid-cols-2">
            <div><dt className="text-[12.5px] text-admin-ink-2">Recipients</dt><dd className="font-semibold">{audience}</dd></div>
            <div><dt className="text-[12.5px] text-admin-ink-2">Destination</dt><dd className="font-mono text-[13px]">{url}</dd></div>
          </dl>
          <div className="rounded-xl border border-admin-line bg-admin-surface p-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-admin-muted">Title and message</p>
            <p className="mt-1 text-[14.5px] font-semibold">{title}</p>
            <p className="whitespace-pre-wrap text-[14px] text-admin-ink-2">{body}</p>
          </div>
          <Notice tone="warning">{direct ? `This sends a real push notification to ${recipient?.fullName || direct.driver} only. It can't be recalled.` : "This sends a real push notification immediately. It can't be recalled."}</Notice>
          {error && <p role="alert" className="text-[13px] text-admin-status-red">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
