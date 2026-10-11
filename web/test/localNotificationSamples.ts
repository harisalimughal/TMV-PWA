import { fetchSession } from "../src/api/auth";
import type { LoggedNotification } from "../src/lib/pwa/notificationLog";

type LocalSample = Omit<LoggedNotification, "id"> & { modalTestKey: string };
export function localNotificationSamples(now = Date.now()): LocalSample[] {
  const common = { url: "", kind: "broadcast_message", receivedAt: now, read: false, dismissed: true };
  return [
    { ...common, modalTestKey: "tmv-local-modal-MA-short", title: "TEST ONLY - MA short notification",
      body: "This is a short notification-modal test for MA, not a real job instruction. Open it from the bell to read the complete message. No payment or job action is needed. SHORT TEST END." },
    { ...common, modalTestKey: "tmv-local-modal-MA-long", title: "TEST ONLY - MA long notification with the complete message available in Notification details",
      body: [
        "TEST ONLY - this is a local dummy notification for MA. It does not relate to a real customer or job. Do not collect payment, travel anywhere, or change a booking because of this message.",
        "The bell should show only a compact preview. Opening this notification should show the full title and every paragraph in the notification details modal.",
        "This longer example checks how a complete office message looks. A real message might contain collection and delivery notes, access restrictions, parking information, helper arrangements, and a final instruction. All of the details in this test are invented and require no action.",
        "Paragraph breaks should remain visible, even when the screen is narrow. When the content is taller than the available space, scroll inside the modal. The last paragraph must remain reachable without cutting off any text.",
        "Closing the notification should leave the current job screen unchanged. Opening it should mark this message read without marking other messages read. You can reopen it from the bell to inspect the full text again.",
        "FINAL CHECK - LONG TEST END. If this sentence is visible, the full notification is displayed. This is only a local display test."
      ].join("\n\n") }
  ];
}

export async function seedLocalNotificationSamples(): Promise<number> {
  if (!import.meta.env.DEV) throw new Error("Local notification tests are development-only.");
  const driver = await fetchSession();
  if (driver?.initials !== "MA") throw new Error("Sign in as MA in this browser first.");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("tmv-notifications", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("notifications")) request.result.createObjectStore("notifications", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction("notifications", "readwrite"), store = tx.objectStore("notifications");
      let added = 0;
      const request = store.getAll();
      request.onsuccess = () => {
        const now = Date.now();
        const existing = new Set((request.result as Array<LoggedNotification & { modalTestKey?: string }>).filter(row => row.receivedAt >= now - 86400000).map(row => row.modalTestKey));
        for (const sample of localNotificationSamples(now)) if (!existing.has(sample.modalTestKey)) { store.add(sample); added++; }
      };
      tx.oncomplete = () => resolve(added);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Local notification storage could not be updated."));
    });
  } finally { db.close(); }
}
