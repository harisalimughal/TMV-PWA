/**
 * Persisted history of received push notifications, for the bell icon's dropdown.
 *
 * Backed by IndexedDB, not localStorage, because the service worker (push-worker.js)
 * has to be able to write to it too -- a push can arrive while no app tab is open at
 * all, and that notification should still show up in the bell next time the driver/
 * admin opens the app. localStorage isn't reachable from a service worker; IndexedDB
 * is the one storage both contexts share. The raw IndexedDB API is used here (not
 * wrapped in a library) specifically so push-worker.js -- a plain script, no bundler,
 * no imports -- can open the exact same database with matching vanilla calls; see the
 * DB_NAME/STORE_NAME/DB_VERSION constants there, which must stay in sync with these.
 */

export interface LoggedNotification {
  id: number;
  title: string;
  body: string;
  url: string;
  receivedAt: number;
  read: boolean;
}

const DB_NAME = "tmv-notifications";
const STORE_NAME = "notifications";
const DB_VERSION = 1;
const MAX_ENTRIES = 50;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listNotifications(): Promise<LoggedNotification[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const items = (request.result as LoggedNotification[]).sort((a, b) => b.receivedAt - a.receivedAt);
      resolve(items.slice(0, MAX_ENTRIES));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function unreadCount(): Promise<number> {
  const items = await listNotifications();
  return items.filter(item => !item.read).length;
}

export async function markRead(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const entry = getRequest.result as LoggedNotification | undefined;
      if (!entry || entry.read) {
        resolve();
        return;
      }
      store.put({ ...entry, read: true });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function markAllRead(): Promise<void> {
  const items = await listNotifications();
  await Promise.all(items.filter(item => !item.read).map(item => markRead(item.id)));
}
