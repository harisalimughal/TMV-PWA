import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BellPlus, ArrowUpRight, Loader2 } from "lucide-react";
import { seedLocalNotificationSamples } from "./localNotificationSamples";
import "../src/index.css";

function NotificationTest() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [success, setSuccess] = useState(false);
  async function seed() {
    setBusy(true); setSuccess(false);
    try {
      const added = await seedLocalNotificationSamples();
      setMessage(added ? "Both test notifications were added to this browser." : "Both test notifications are already in this browser.");
      setSuccess(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add local test notifications."); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-bg px-5 py-12 text-fg">
    <div className="mx-auto max-w-lg space-y-6">
      <header className="flex items-center gap-3"><img src="/tmv-logo.png" alt="The Man Van" className="h-12 w-12 object-contain" /><h1 className="text-2xl font-semibold">MA notification test</h1></header>
      <p className="text-sm text-fg-muted">Local browser only. No pushes, job changes or backend writes.</p>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} onClick={() => void seed()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-brand-fg disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin" /> : <BellPlus size={18} />}Add test notifications</button>
        <a href="/" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-4"><ArrowUpRight size={18} />Open driver app</a>
      </div>
      {message && <p role={success ? "status" : "alert"} className={success ? "text-success" : "text-danger"}>{message}</p>}
    </div>
  </main>;
}
if (import.meta.env.DEV) createRoot(document.getElementById("root")!).render(<NotificationTest />);
else document.getElementById("root")!.textContent = "Local notification tests are unavailable in production.";
