# Driver Notification Detail Modal

Client revision, 2026-10-10. Implemented locally; no deployment authorized.

## Behavior

Driver mobile/tablet top-bar and desktop-sidebar bells now opt into a detail modal when a notification item is selected. The compact dropdown preview remains; opening a notification marks its local read state without navigating away from the current job. Admin bell behavior remains its existing direct navigation.

The modal displays the full saved title/body without truncation or line clamps, preserving paragraph breaks. It includes a type badge, London received timestamp, highlighted title and accented message content; congestion/tunnel/arrival reminders use warning styling. Long text scrolls inside the modal. Portal rendering avoids header/sidebar clipping; existing modal focus trapping, scroll locking and focus return are reused. Close, Escape and backdrop dismissal work, while non-dismissible forms remain protected.

An explicit Open related page link is offered only for valid same-origin HTTP(S) destinations. Message content is rendered as plain React text, never HTML. Invalid times and unknown kinds have safe fallbacks. Local read-storage failure does not prevent opening the message. Existing mark-all-read, notification retention, persistent alert banners, operating-system push clicks and push-worker message storage are unchanged.

This reveals complete content already stored in the notification log; it cannot reconstruct a message that was shortened before reaching the application. No notifications, database jobs or API/provider writes were created to test it.

## Verification

### User-Requested MA Push Test (2026-10-11)

Local follow-up: the user's driver app runs at localhost:3001. Registered-device push acceptance does not populate another origin's IndexedDB history. Added development-only /notification-test.html and its local test helper. The user must be signed in as MA on that exact origin; clicking Add test notifications stores two labelled examples in that browser only, preserves existing entries and skips repeated samples within the normal 24-hour visibility window. Samples are unread but dismissed for persistent banners, so only bell/modal behavior is tested. No backend writes or additional pushes are made. This is not a production feature or a replacement for push delivery. Verified HTTP 200 on localhost:3001, 12 sample/bell tests and frontend TypeScript check.

At the user's explicit request, sent two TEST ONLY office-message pushes to MA's registered non-admin devices: short body 179 characters and long multiline body 1,315 characters. Both were accepted by all seven registered push endpoints (four desktop, two iOS, one Android); acceptance is not proof of device receipt or modal display. Unique message tags keep the samples separate. Messages contain no real customer/job instruction and end with SHORT TEST END / LONG TEST END. Existing VAPID keys were reused; no backend records, jobs, settings or subscriptions were modified or pruned. No other driver's endpoints were targeted. No code push/deployment was performed. The new modal must be tested in a frontend build that contains it; sending notifications does not update an older deployed frontend.

- Full frontend suite: 240 tests across 52 files passed. Frontend build/typecheck passed; existing bundle-size warning remains.
- Tests cover full multiline content, portal placement, no automatic navigation, read/mark-all-read, failed local storage, focus/scroll restoration, Close/Escape, preserved default admin navigation, alert highlighting, literal HTML handling and invalid/cross-origin links. Shared backdrop tests cover dismissal and protected forms.
- Synthetic browser preview checked desktop and 390px mobile sizing. The complete 1,621-character example and last instruction were preserved; title/body had no line clamp and page width did not overflow. The content scroll region was exercised to its end with the final instruction visible.
- Preview: `http://127.0.0.1:5181/phase8-check.html?preview=notification`. This uses an in-memory example, not real notification history or IndexedDB writes. Live API access is blocked.
- No production/staging database access, push delivery, provider calls, commit, push or deployment.
