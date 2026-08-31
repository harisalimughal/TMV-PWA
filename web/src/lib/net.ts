import { useEffect, useState } from "react";
import { listQueued, subscribe } from "./outbox";

/** Live online/offline state. navigator.onLine alone isn't reactive. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

/** How many submissions are sitting in the outbox waiting for signal. */
export function useQueuedCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void listQueued().then(items => {
        if (alive) setCount(items.length);
      });
    };
    refresh();
    const unsubscribe = subscribe(refresh);
    window.addEventListener("online", refresh);
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener("online", refresh);
    };
  }, []);
  return count;
}
