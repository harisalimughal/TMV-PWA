# Activity chat: UI (phases 3 to 5) and what is not done

The backend (Express, MongoDB, push) is not in this repository and was not reachable, so the screens are
built against the proposed contract (`src/lib/activity/contract.ts`, `docs/ACTIVITY_CHAT_PHASE1.md`).
Against a server without the endpoints they say so; they never show sample data.

## What exists

| Area | Where | Behaviour |
| --- | --- | --- |
| Admin nav | `navigation.ts`, `Layout.tsx` | "Activity" after Jobs, shortcut `A`, unread badge from `GET /api/admin/activity/unread` (no badge when unavailable). |
| Admin workspace | `pages/ActivityPage.tsx`, `components/activity/*` | Bordered two-panel layout. List: search, driver, activity type, date, unread only; rows show driver, job, status, last entry, unread count. Chat: sticky header, day separators, bubbles by kind, "Load earlier", new-entry pill when scrolled up, reconnecting notice. Below 768 px the list and the chat are separate screens (Back works). Filters and the open conversation live in the URL. |
| Notify Driver | `ChatPane.tsx`, `AlertsCenterPage.tsx`, `SendBroadcastPushModal.tsx` | Bell button opens the existing Broadcast modal at `?section=alerts&compose=driver&msgDriver=KA&msgJob=ID`, locked to that driver and job (title `Job Update — <job>`). No audience picker, never all drivers; a link missing either value opens nothing. It is not chat: it sends through the existing `POST /api/push/admin/broadcast` with `driverInitials`, after re-reading the job and refusing if the driver changed or is missing. Disabled with a reason when the job has no driver or is cancelled. Closing or sending returns to the conversation. The normal Broadcast notice is unchanged. |
| Driver app | `MessagesScreen`, `JobActivityScreen`, `OfficeMessagesBanner`, `api/activity.ts`, `lib/useOfficeMessages.ts` | Banner on Jobs only when office messages are unread; inbox per job; job activity with office messages as bubbles and recorded steps as quiet cards. No reply box: it needs a server `canMessage`, and none is offered yet. Opening `/?tab=activity&job=ID` (a tapped notification) goes straight to that job's activity after sign-in. |
| Shared | `src/lib/activity/` | Catalogue, contract, ordering and merge (`model.ts`), polling thread hook (`useThread.ts`), request and error helpers (`client.ts`). Pure, so the driver bundle can use it without the admin code. |
| Dev and demo only | `src/mocks/activity.ts` | Conversations, entries (derived from each demo job's state using the real catalogue), read markers, and messages, all in memory. A posted message is stored as `delivery: "recorded"`, never "notified", because nothing contacts a device. Not in production builds. |

## What the screens will not do

- No double ticks, "read" marks, typing indicator or online status: nothing in the system provides them.
  Admin notifications are not added to the conversation by this flow.
- GPS observations are labelled "Tracker signal, not confirmed". There is no Loading started, Unloading
  completed or Departed event because the driver app has no such step. The "Loading", "Unloading" and
  "Departures" filters map to the van-loaded photo, Finish Move plus the empty-van photo, and the tracker's
  drop-off departure signal.
- An office message never looks like an automatic event (different alignment, colour and label), and it is
  never an all-driver broadcast.

## Not done, and why

- **Phase 2, backend**: schema, `recordActivity` inside the existing action handlers, the outbox, unread
  and read-state storage, and the routes. They belong in the backend repository; the specification is in
  `ACTIVITY_CHAT_PHASE1.md`.
- **Real-time delivery** is polling (5 s open conversation, 20 s list, 30 s unread and driver inbox),
  chosen to match "no new infrastructure". Nothing here has been run against a real server.
- **Push to the driver** for a direct message, the deep link target, and "notified" tracking depend on that
  backend. The driver app already opens `/?tab=activity&job=ID`, so the server should send that URL.
- **End-to-end tests** against a live backend, load and security testing of the server rules: not possible
  from this repository. Unit and component tests run the screens against the demo mock instead.
- Driver replies: the contract allows them, the screen shows a reply box only when `capabilities.canMessage`
  is true for the driver, and the driver screen has no composer yet.
