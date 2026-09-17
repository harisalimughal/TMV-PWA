import React, { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { factoryReset, type FactoryResetSummary } from "../api";
import { Button } from "../../../../ui";
import { useToast } from "../../../../components/ui/Toast";

const CONFIRM_PHRASE = "RESET";

/** What Factory Reset wipes vs. leaves alone -- shown to the admin before they commit,
 *  since this is a one-way action with no undo. */
const WIPES = [
  "Evidence photos (arrival / loaded / empty-van) and signatures",
  "Activity log (every job's status-change history)",
  "Check In / Check Out / Parking Liability / Liability Report submissions",
  "Van Mileage / Fuel / Service records and compliance dates (MOT / road tax / insurance)",
  "Exceptions (jobs that vanished mid-move)",
  "Push notification subscriptions -- every device re-subscribes on its next login"
];

const KEEPS = [
  "Jobs -- synced from Google Calendar, untouched either way",
  "Driver accounts -- the real roster, logins and van assignments",
  "Pricing/API settings -- admin-configured rates and keys"
];

export function MaintenancePage() {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [resetting, setResetting] = useState(false);
  const [lastResult, setLastResult] = useState<FactoryResetSummary | null>(null);

  async function handleConfirm() {
    if (typed !== CONFIRM_PHRASE || resetting) return;
    setResetting(true);
    try {
      const { deleted } = await factoryReset();
      setLastResult(deleted);
      setConfirmOpen(false);
      setTyped("");
      toast.success("Factory reset complete -- app data cleared.");
    } catch (err: any) {
      toast.error(err?.message || "Factory reset failed. Check the server logs.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-[900px] mx-auto pb-12">
      <div className="px-2">
        <p className="text-[13px] text-admin-muted">
          A one-time cleanup for handing this app to a new client -- clears every job-generated
          record so it starts from zero, without touching jobs, drivers or settings.
        </p>
      </div>

      <div className="bg-white rounded-module shadow-sm border border-admin-status-red/30 p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 rounded-card bg-admin-status-red-bg text-admin-status-red flex items-center justify-center">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-admin-ink text-[15px]">Factory Reset</h2>
            <p className="text-[13px] text-admin-muted mt-0.5">
              Permanently deletes the records below, and their Cloudinary photos. This cannot be undone.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-admin-status-red block mb-2">Wipes</span>
            <ul className="space-y-1.5">
              {WIPES.map(item => (
                <li key={item} className="text-[13px] text-admin-ink flex gap-2">
                  <span className="text-admin-status-red shrink-0">•</span>{item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-admin-status-green block mb-2">Keeps</span>
            <ul className="space-y-1.5">
              {KEEPS.map(item => (
                <li key={item} className="text-[13px] text-admin-ink flex gap-2">
                  <span className="text-admin-status-green shrink-0">•</span>{item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-2 border-t border-admin-line">
          <Button variant="danger" onClick={() => setConfirmOpen(true)} iconLeft={<Trash2 />}>
            Factory Reset...
          </Button>
        </div>
      </div>

      {lastResult && (
        <div className="bg-white rounded-module shadow-sm border border-admin-line p-6">
          <h3 className="font-bold text-admin-ink text-[14px] mb-3">Last reset -- records deleted</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
            <div><span className="text-admin-muted block">Evidence</span><span className="font-bold text-admin-ink">{lastResult.evidence}</span></div>
            <div><span className="text-admin-muted block">Activity</span><span className="font-bold text-admin-ink">{lastResult.activity}</span></div>
            <div><span className="text-admin-muted block">Scenarios</span><span className="font-bold text-admin-ink">{lastResult.scenarioSubmissions}</span></div>
            <div><span className="text-admin-muted block">Van records</span><span className="font-bold text-admin-ink">{lastResult.vanRecords}</span></div>
            <div><span className="text-admin-muted block">Van compliance</span><span className="font-bold text-admin-ink">{lastResult.vanCompliance}</span></div>
            <div><span className="text-admin-muted block">Exceptions</span><span className="font-bold text-admin-ink">{lastResult.exceptions}</span></div>
            <div><span className="text-admin-muted block">Push devices</span><span className="font-bold text-admin-ink">{lastResult.pushSubscriptions}</span></div>
            <div><span className="text-admin-muted block">Cloudinary photos</span><span className="font-bold text-admin-ink">{lastResult.cloudinaryAssetsDestroyed}</span></div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-module shadow-2xl w-full max-w-[440px] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-admin-line flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-admin-status-red shrink-0" />
              <h2 className="text-title text-fg">Confirm Factory Reset</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[13px] text-admin-ink">
                This permanently deletes all evidence, activity, scenario submissions, van
                records, exceptions and push subscriptions -- and their Cloudinary photos.
                Jobs, drivers and settings are not affected. This cannot be undone.
              </p>
              <div>
                <label className="block text-eyebrow text-fg-subtle tracking-wider mb-1.5">
                  Type "{CONFIRM_PHRASE}" to confirm
                </label>
                <input
                  type="text"
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  autoFocus
                  className="w-full h-10 px-3 rounded-card border border-admin-line bg-admin-surface text-[13px] text-admin-ink outline-none focus:border-admin-status-red transition"
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line bg-surface-sunken px-6 py-4">
              <Button variant="ghost" onClick={() => { setConfirmOpen(false); setTyped(""); }} disabled={resetting}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirm}
                disabled={typed !== CONFIRM_PHRASE || resetting}
                iconLeft={resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              >
                {resetting ? "Resetting…" : "Permanently Reset"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
