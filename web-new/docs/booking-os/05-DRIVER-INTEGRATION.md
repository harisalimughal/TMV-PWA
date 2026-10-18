# Booking OS 05: driver app integration (specification)

The driver app **is** in this repository and stays unchanged unless the contract below needs a field. The backend
that serves it is external.

## 1. Existing contract to preserve (verified in `src/api/jobs.ts`)

Driver login, `GET /api/jobs/list` (the driver's own jobs, Today and Upcoming), job details (`Job` type), actions
(`/viewed`, `/on-my-way`, `/start`, `/actions {action,input}`), evidence and signature uploads, `driver-summary`
(payment and time submission), scenarios and the offline outbox, pending submissions, messages, push. Job
identifiers `jobId` and `calendarEventId` and the driver key `initials` stay stable.

## 2. Delivery of an internal assignment

Only a **confirmed assignment on a confirmed booking** produces or updates a Job. The server upserts the Job
idempotently, keyed by the assignment id, copying the booking fields the driver sees today (customer, addresses,
crew, booked window, notes, extras text) so the driver app needs no change. `calendarEventId` is populated while the
Calendar mirror is on and empty for internal-only jobs; the driver app must not require it.

| Event | Server behaviour | Driver sees |
| --- | --- | --- |
| New assignment | upsert Job READY, notify | job in list, "New job assigned" notification |
| Update (time, address, notes) | update Job, notify if material | updated details, "Job updated" |
| Reassignment | release A, assign B in one transaction | A: job removed with a cancellation note; B: new job |
| Reschedule | update Job window, notify | new time |
| Cancellation | Job `CANCELLED`, notify | job marked cancelled; started jobs follow the force rule |
| Completion | driver flow unchanged | unchanged |

## 3. Failure handling

Offline drivers receive state on next fetch (`/jobs/list` is the source of truth; push is a hint). Duplicate or
out-of-order events are resolved by the Job `version`/`updatedAt`; stale pushes never overwrite newer data.
Reassignment during an active job is refused unless an administrator forces it with a reason, and the audit and
Activity record both drivers. Cancelled assignments remove the job from the list but keep it for reports.

## 4. Notifications and Activity

Reuse the existing push and `Notify Driver` flow (preselect the driver and the related booking or job). Do not
show "delivered" or "read" unless the provider reports it. Booking events join the typed Activity catalogue (event
type, related ids, actor, timestamp, changes). Driver replies exist only if the Activity backend ships them.

## 5. Tracking, time and envelope

Jobs keep using the existing tracker mapping (imei to driver) and the existing system, driver-reported and company
billing times and the envelope comparison; Booking OS does not touch them. Extra charges stay on the Job.

## 6. Tests

Existing driver and workflow tests keep passing; add contract tests for the Job fields an internal assignment must
fill, and mock-backed tests for list refresh after reassignment and cancellation.
