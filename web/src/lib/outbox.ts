/**
 * Offline outbox for scenario submissions.
 *
 * This is a PWA whose core loop is "upload photos and a signature from wherever the
 * van happens to be parked" -- basements, lifts, loading bays. Before this, a submit
 * with no signal failed, showed "Couldn't submit this form. Try again," and if the
 * driver backgrounded the app the photos and the customer's signature were simply
 * gone. On a Liability Report that's the evidence for a damage claim.
 *
 * Scope note: only *scenario* submissions are queued. They're terminal -- the driver
 * fills the form, submits, and the server records it. The main job-workflow steps are
 * deliberately NOT queued, because each one advances a server-side state machine and
 * the driver needs to see the real next step before continuing; replaying those out of
 * order would corrupt the workflow. Those steps block with an explicit offline message
 * instead, and keep the form filled in so nothing is lost.
 *
 * Blobs and Files are structured-cloneable, so photos and the signature PNG go into
 * IndexedDB as-is with no base64 round-trip.
 */

const DB_NAME = "tmv-outbox";
const DB_VERSION = 1;
const STORE = "submissions";

export interface QueuedSubmission {
  id: string;
  /** Fully-qualified endpoint this replays to. */
  url: string;
  /** Shown in the UI, e.g. "Liability Report - Job 10231". */
  label: string;
  fields: Record<string, string>;
  photos: File[];
  signature: Blob | null;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const req = run(transaction.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        transaction.oncomplete = () => db.close();
      })
  );
}

export async function enqueue(item: Omit<QueuedSubmission, "id" | "createdAt" | "attempts">): Promise<void> {
  const record: QueuedSubmission = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    attempts: 0
  };
  await tx("readwrite", store => store.put(record));
  notify();
}

export async function listQueued(): Promise<QueuedSubmission[]> {
  try {
    const all = await tx<QueuedSubmission[]>("readonly", store => store.getAll() as IDBRequest<QueuedSubmission[]>);
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    // Private-browsing modes can refuse IndexedDB outright. An empty queue is the
    // honest answer there; enqueue() will have thrown already and the caller shows
    // the failure inline.
    return [];
  }
}

async function remove(id: string): Promise<void> {
  await tx("readwrite", store => store.delete(id));
}

async function markFailed(item: QueuedSubmission, message: string): Promise<void> {
  await tx("readwrite", store => store.put({ ...item, attempts: item.attempts + 1, lastError: message }));
}

/* -- change subscription, so the offline banner can show a live count -------------- */

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  listeners.forEach(l => l());
}

/* -- flushing --------------------------------------------------------------------- */

let flushing = false;

/** Replays everything queued, oldest first. Safe to call repeatedly. */
export async function flush(): Promise<{ sent: number; failed: number }> {
  if (flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    return { sent: 0, failed: 0 };
  }
  flushing = true;
  let sent = 0;
  let failed = 0;

  try {
    const queued = await listQueued();
    for (const item of queued) {
      const form = new FormData();
      for (const [key, value] of Object.entries(item.fields)) form.append(key, value);
      item.photos.forEach(photo => form.append("photos", photo));
      if (item.signature) form.append("signature", item.signature, "signature.png");

      try {
        const res = await fetch(item.url, { method: "POST", credentials: "same-origin", body: form });
        if (res.ok) {
          await remove(item.id);
          sent += 1;
        } else if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408 && res.status !== 429) {
          // A 4xx that isn't auth/rate-limiting means this submission will never be
          // accepted however many times we replay it -- drop it rather than retrying
          // forever, but record why so the UI can tell the driver it needs redoing.
          await markFailed(item, `Rejected by the server (${res.status}).`);
          failed += 1;
        } else {
          failed += 1;
          break; // server-side or auth problem: stop, try the whole queue again later
        }
      } catch {
        failed += 1;
        break; // still no usable connection
      }
    }
  } finally {
    flushing = false;
    notify();
  }

  return { sent, failed };
}

/** Called once from App.tsx: flush on startup and whenever the device comes back. */
export function startOutboxSync(): () => void {
  const handleOnline = () => void flush();
  window.addEventListener("online", handleOnline);
  void flush();
  return () => window.removeEventListener("online", handleOnline);
}
