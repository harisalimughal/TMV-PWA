/**
 * Job activity: the shared vocabulary for the Activity Chat.
 *
 * One stream per job carries two different things that must never be confused:
 *
 *   operational  something that happened in the job. Written by the SERVER, inside the
 *                existing action handlers, after the action succeeded. No client ever
 *                posts one, so a driver cannot claim an event they did not perform.
 *   message      something a person typed to the other party (admin <-> assigned driver).
 *
 * The catalogue below is the confirmed mapping from what the apps really do to an event:
 * existing client action -> backend operation -> event type -> title. It was read from the
 * driver workflow (src/screens/workflow/steps.ts, JobWorkflowScreen.tsx, src/api/jobs.ts)
 * and the admin API (src/screens/admin/dashboard/api.ts). Only things those files show are
 * listed; anything else (loading started, unloading completed, departed ...) has no
 * driver action behind it in this application and is deliberately absent.
 *
 * Pure module: safe to import from the driver app and the admin alike.
 */

export type ActivityKind = "operational" | "message";
export type ActorRole = "driver" | "admin" | "system";

export type ActivityCategory =
  | "lifecycle" // viewed, on my way, started, completed, cancelled
  | "arrival" // pickup and drop-off arrival
  | "evidence" // photos and signature
  | "issue" // issue reports and "no issues"
  | "charges" // extras, overtime, totals
  | "payment"
  | "customer" // review requests
  | "assignment" // assigned / reassigned
  | "tracking" // GPS-derived observations
  | "message"; // direct messages

export type ActivitySource = "driver_app" | "admin_dashboard" | "system" | "gps_tracker" | "calendar_sync";

/**
 * How trustworthy the fact is.
 *   driver_submitted  the driver pressed the button / uploaded the item in the driver app
 *   admin_recorded    an authenticated admin did it in the dashboard
 *   system_recorded   the server derived it from a state transition or schedule
 *   tracker_observed  a GPS signal suggested it. NEVER proof that work was done
 *   not_applicable    a direct message (it claims nothing about the job)
 */
export type Verification = "driver_submitted" | "admin_recorded" | "system_recorded" | "tracker_observed" | "not_applicable";

export type Stop = "pickup" | "dropoff" | "stopby";

/** The backend call that must succeed before the event may be recorded. */
export interface Trigger {
  /** `sendAction` name in POST /api/jobs/:id/actions, when the step uses one. */
  action?: string;
  /** HTTP method and path of the job endpoint (or the tracker field it reads). */
  endpoint?: string;
  /** Workflow `currentState` the job is in when the action is accepted. */
  atState?: string;
}

export interface ActivityEventDef {
  type: string;
  kind: ActivityKind;
  category: ActivityCategory;
  actorRole: ActorRole;
  source: ActivitySource;
  verification: Verification;
  /** Fixed headline. Dynamic detail goes in the body or metadata, never the title. */
  title: string;
  stop?: Stop;
  trigger: Trigger;
  /** Shown in the chat by default. "quiet" events are stored and filterable but folded away. */
  visibility: "chat" | "quiet";
  /** Optional plain-English note on what the event does NOT prove. */
  caveat?: string;
}

const driver = (d: Omit<ActivityEventDef, "kind" | "actorRole" | "source" | "verification"> & Partial<Pick<ActivityEventDef, "verification">>): ActivityEventDef =>
  ({ kind: "operational", actorRole: "driver", source: "driver_app", verification: "driver_submitted", ...d });
const admin = (d: Omit<ActivityEventDef, "kind" | "actorRole" | "source" | "verification">): ActivityEventDef =>
  ({ kind: "operational", actorRole: "admin", source: "admin_dashboard", verification: "admin_recorded", ...d });
const system = (d: Omit<ActivityEventDef, "kind" | "actorRole" | "verification"> & Partial<Pick<ActivityEventDef, "verification">>): ActivityEventDef =>
  ({ kind: "operational", actorRole: "system", verification: "system_recorded", ...d });

export const ACTIVITY_EVENTS: readonly ActivityEventDef[] = [
  /* ------------------------------------------------------- driver-submitted (driver app) -- */
  driver({ type: "job.viewed", category: "lifecycle", title: "Driver opened the job", visibility: "quiet", trigger: { endpoint: "POST /api/jobs/:id/viewed" },
    caveat: "Only means the job was opened on the driver's phone." }),
  driver({ type: "driver.on_my_way", category: "lifecycle", title: "Driver is on the way", visibility: "chat", trigger: { endpoint: "POST /api/jobs/:id/on-my-way", atState: "READY" } }),
  driver({ type: "job.started", category: "lifecycle", title: "Driver started the job", visibility: "chat", trigger: { endpoint: "POST /api/jobs/:id/start", atState: "READY" } }),
  driver({ type: "arrival.photo_submitted", category: "arrival", stop: "pickup", title: "Proof of arrival photo submitted", visibility: "chat",
    trigger: { endpoint: "POST /api/jobs/:id/evidence", atState: "WAITING_ARRIVAL_PHOTO" },
    caveat: "A photo with its own capture time and place; the driver's word that they have arrived." }),
  driver({ type: "issue.none_reported_pickup", category: "issue", stop: "pickup", title: "No issues reported at pickup", visibility: "chat",
    trigger: { action: "ISSUES_NONE", atState: "WAITING_ARRIVAL_ISSUES_CHECK" } }),
  driver({ type: "issue.none_reported_dropoff", category: "issue", stop: "dropoff", title: "No issues reported at drop-off", visibility: "chat",
    trigger: { action: "ISSUES_NONE", atState: "WAITING_EMPTY_VAN_ISSUES_CHECK" } }),
  driver({ type: "issue.report_submitted", category: "issue", title: "Driver submitted an issue report", visibility: "chat",
    trigger: { endpoint: "POST /api/jobs/:id/scenarios/:scenario", atState: "WAITING_ARRIVAL_ISSUES_CHOICE | WAITING_EMPTY_VAN_ISSUES_CHOICE" },
    caveat: "The form is the evidence. Metadata names the report type; the body never copies free text." }),
  driver({ type: "issue.resumed", category: "issue", title: "Driver continued after the issue report", visibility: "quiet",
    trigger: { action: "ISSUES_RESUME", atState: "WAITING_*_ISSUES_CHOICE" } }),
  driver({ type: "load.photo_submitted", category: "evidence", stop: "pickup", title: "Van loaded photo submitted", visibility: "chat",
    trigger: { endpoint: "POST /api/jobs/:id/evidence", atState: "WAITING_LOADED_PHOTO" },
    caveat: "Shows what the driver photographed. There is no separate 'loading started' step in this application." }),
  driver({ type: "move.finished", category: "lifecycle", stop: "dropoff", title: "Driver finished the move", visibility: "chat",
    trigger: { action: "FINISH_MOVE", atState: "IN_PROGRESS" },
    caveat: "The driver's statement that everything is unloaded; not a tracker reading." }),
  driver({ type: "emptyvan.photo_submitted", category: "evidence", stop: "dropoff", title: "Empty van photo submitted", visibility: "chat",
    trigger: { endpoint: "POST /api/jobs/:id/evidence", atState: "WAITING_EMPTY_VAN_PHOTO" } }),
  driver({ type: "customer.signature_captured", category: "evidence", stop: "dropoff", title: "Customer signature captured", visibility: "chat",
    trigger: { endpoint: "POST /api/jobs/:id/signature", atState: "WAITING_CLIENT_CONFIRMATION" } }),
  driver({ type: "charges.extra_submitted", category: "charges", title: "Extra charges submitted", visibility: "chat",
    trigger: { action: "SUBMIT_EXTRA_CHARGES", atState: "WAITING_EXTRA_CHARGES" } }),
  driver({ type: "charges.overtime_submitted", category: "charges", title: "Overtime submitted", visibility: "chat",
    trigger: { action: "SUBMIT_OVERTIME", atState: "WAITING_OVERTIME" } }),
  driver({ type: "charges.total_submitted", category: "charges", title: "Total charges submitted", visibility: "chat",
    trigger: { action: "SUBMIT_TOTAL_CHARGES", atState: "WAITING_TOTAL_CHARGES" },
    caveat: "Amounts belong in metadata as pence. Calculated, final and received money stay distinct." }),
  driver({ type: "payment.recorded", category: "payment", title: "Payment recorded by the driver", visibility: "chat",
    trigger: { action: "SUBMIT_PAYMENT", atState: "WAITING_PAYMENT" },
    caveat: "A driver-reported receipt, not bank confirmation. Invoices are billed, not received." }),
  driver({ type: "charges.manual_details_submitted", category: "charges", title: "Manual job details submitted", visibility: "chat",
    trigger: { endpoint: "POST /api/jobs/:id/driver-summary" } }),
  driver({ type: "review.declined", category: "customer", title: "Driver did not request a review", visibility: "quiet",
    trigger: { action: "REVIEW_NONE", atState: "WAITING_REVIEW_CHECK" } }),
  driver({ type: "review.requested", category: "customer", title: "Review request chosen", visibility: "quiet",
    trigger: { action: "REVIEW_YES", atState: "WAITING_REVIEW_CHECK" } }),
  driver({ type: "review.email_sent", category: "customer", title: "Review email sent to the customer", visibility: "chat",
    trigger: { action: "SEND_REVIEW_EMAIL", atState: "WAITING_REVIEW_SEND" } }),
  driver({ type: "workflow.step_reversed", category: "lifecycle", title: "Driver went back a step", visibility: "quiet",
    trigger: { action: "GO_BACK", atState: "WAITING_EXTRA_CHARGES | WAITING_OVERTIME | WAITING_TOTAL_CHARGES | WAITING_PAYMENT" },
    caveat: "Only data-entry steps can be reversed; recorded so a repeated submission is explained." }),

  /* --------------------------------------------------------------- admin-recorded (dashboard) -- */
  admin({ type: "job.created_by_admin", category: "lifecycle", title: "Job added in the dashboard", visibility: "chat", trigger: { endpoint: "POST /api/admin/jobs" } }),
  admin({ type: "assignment.reassigned", category: "assignment", title: "Driver assigned or changed", visibility: "chat", trigger: { endpoint: "POST /api/admin/jobs/:id/reassign" } }),
  admin({ type: "job.finished_manually", category: "lifecycle", title: "Job marked finished by an admin", visibility: "chat", trigger: { endpoint: "POST /api/admin/jobs/:id/finish-manually" },
    caveat: "Missing evidence stays missing; the admin's reason is stored in metadata." }),
  admin({ type: "evidence.removed", category: "evidence", title: "An evidence item was removed by an admin", visibility: "chat", trigger: { endpoint: "DELETE /api/admin/jobs/:id/evidence/:evidenceId" },
    caveat: "Appended as a new event; the original upload event is never edited or deleted." }),
  admin({ type: "job.review_updated", category: "lifecycle", title: "Manager review updated", visibility: "quiet", trigger: { endpoint: "POST /api/admin/jobs/:id/review" } }),

  /* --------------------------------------------------------------- system-derived (server) -- */
  system({ type: "job.created_from_calendar", category: "lifecycle", source: "calendar_sync", title: "Job imported from the Calendar", visibility: "chat", trigger: { endpoint: "calendar sync" } }),
  system({ type: "job.completed", category: "lifecycle", source: "system", title: "Job completed", visibility: "chat", trigger: { endpoint: "state COMPLETED reached" },
    caveat: "Recorded when the server's state machine reaches COMPLETED, not when a button is pressed." }),
  system({ type: "job.cancelled", category: "lifecycle", source: "calendar_sync", title: "Job cancelled", visibility: "chat", trigger: { endpoint: "status CANCELLED reached" } }),
  system({ type: "arrival_proof.overdue", category: "arrival", stop: "pickup", source: "system", title: "Arrival proof is overdue", visibility: "chat",
    trigger: { endpoint: "arrivalProofReminderSentAt" }, caveat: "A reminder fired because no proof photo arrived in time." }),
  system({ type: "tracker.pickup_arrival_detected", category: "tracking", stop: "pickup", source: "gps_tracker", verification: "tracker_observed",
    title: "Tracker detected the van near the pickup", visibility: "chat", trigger: { endpoint: "Job.trackerArrivalAt (+ trackerArrivalDistanceMeters)" },
    caveat: "A GPS observation only. It does not show the driver arrived, loaded or started." }),
  system({ type: "tracker.dropoff_arrival_detected", category: "tracking", stop: "dropoff", source: "gps_tracker", verification: "tracker_observed",
    title: "Tracker detected the van near the drop-off", visibility: "chat", trigger: { endpoint: "Job.dropoffTracking.arrivalAt" },
    caveat: "A GPS observation only. It does not show that unloading happened or finished." }),
  system({ type: "tracker.dropoff_departure_detected", category: "tracking", stop: "dropoff", source: "gps_tracker", verification: "tracker_observed",
    title: "Tracker detected the van leaving the drop-off", visibility: "quiet", trigger: { endpoint: "Job.dropoffTracking.departureAt" },
    caveat: "A GPS observation only. It does not show that the customer was handed over or that the job is done." }),
  system({ type: "zone.congestion_detected", category: "tracking", source: "gps_tracker", verification: "tracker_observed",
    title: "Van detected in the congestion zone", visibility: "chat", trigger: { endpoint: "Job.congestionZoneEnteredAt" },
    caveat: "Suggests a charge to the driver; the charge itself is the driver's submission." }),
  system({ type: "zone.tunnel_detected", category: "tracking", source: "gps_tracker", verification: "tracker_observed",
    title: "Van detected at a tunnel or crossing", visibility: "chat", trigger: { endpoint: "Job.tunnelZoneEnteredAt" },
    caveat: "A GPS observation only. Whether a toll applies is the driver's submission on the charges step." })
];

/**
 * Stand-in type for entries that come from a job's existing `activity[]` audit trail
 * (ActivityEntry in the admin types) whose action text has not been verified against the
 * catalogue. Shown as recorded, never upgraded to a driver-confirmed event.
 */
export const LEGACY_EVENT_TYPE = "legacy.entry";

/** Direct messages. Same stream, different kind; they claim nothing about the job. */
export const MESSAGE_TYPES = ["message.admin_to_driver", "message.driver_to_admin"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const ACTIVITY_EVENT_BY_TYPE: ReadonlyMap<string, ActivityEventDef> = new Map(ACTIVITY_EVENTS.map(event => [event.type, event]));
export const isOperationalType = (type: string): boolean => ACTIVITY_EVENT_BY_TYPE.has(type);
export const isMessageType = (type: string): type is MessageType => (MESSAGE_TYPES as readonly string[]).includes(type);

export const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  lifecycle: "Job", arrival: "Arrival", evidence: "Evidence", issue: "Issues", charges: "Charges", payment: "Payment",
  customer: "Customer", assignment: "Assignment", tracking: "Tracker", message: "Messages"
};

/** Wording for how sure the fact is. Used by every surface so "tracker" never reads as "confirmed". */
export const VERIFICATION_LABEL: Record<Verification, string> = {
  driver_submitted: "Submitted by the driver",
  admin_recorded: "Recorded by an admin",
  system_recorded: "Recorded by the system",
  tracker_observed: "Tracker signal, not confirmed",
  not_applicable: ""
};
