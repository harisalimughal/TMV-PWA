# 08. Database and data integrity

**The database, its models, indexes, migrations and transactions are not in this repository.** Nothing here is
a verified database finding. This document lists what the frontend contracts imply, the integrity risks to check
in the backend, and the checks that can be done from the client.

## What the client contracts show

- Jobs are keyed by `jobId` ("TMV-" plus hex) and `calendarEventId`; driver by `initials` (stable key in the UI,
  display name resolved separately); vans by registration; notifications by numeric `notificationId` on device.
- Amounts are pence (`amountCharged`, `finance.*Pence`) or pounds in the drivers summary (`revenuePounds`,
  `cashCollectedPounds`). **Mixed units across endpoints** is a standing risk (F-13); the client converts at the edge.
- Final charge is entered by the driver at completion; a single mistyped value produced £898,988,888 for one job
  (`FINAL_AUDIT.md`); the backend accepts it, the dashboard now flags it.
- Job `activity[]` is an embedded audit trail with free-text actions; the new Activity contract replaces it with
  typed events (proposal in `ACTIVITY_CHAT_PHASE1.md`).

## Integrity risks to verify in the backend

| ID | Risk | Why it matters | Check |
| --- | --- | --- | --- |
| D1 | No upper bound or sanity check on `amountCharged` | already happened once | server validation and an alert threshold |
| D2 | Duplicate completion or duplicate payment on retry | `sendAction` has no request id | unique request id per action; idempotent handlers |
| D3 | Reassign after start | driver on a started job replaced | transition rules and audit entry |
| D4 | Calendar sync vs edits | job appears after sync; edits after creation | conflict policy, idempotent upsert on `calendarEventId` |
| D5 | Orphans on delete | delete job from admin | cascade or soft delete for evidence, scenarios, notifications |
| D6 | Mixed pence/pounds | rounding drift | one unit in storage, conversion only at presentation |
| D7 | Time zone | London reporting days | store UTC, derive London day in one function (client uses Luxon consistently) |
| D8 | Activity ordering | offline phone events arrive late | `occurredAt` and `recordedAt` both stored (design in Phase 1 doc) |
| D9 | Payment traceability | Booking -> Job -> Charge -> Payment missing | add payment records keyed by job and invoice |

## Safe client-side checks available today

`revenueAnomaly` (`DriverCards.tsx`) and the per-job outlier flag cover D1 visibly. The Comparison tab shows
system versus manual totals. No client check can prove D2 to D9.
