import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSettings, saveSetting, type EditableSetting } from "../api";
import type { SaveState } from "../components/ds";
import { useUnsavedChanges } from "../utils/unsavedChanges";

export const SETTINGS_QUERY_KEY = ["admin_settings"] as const;

export interface SaveOutcome { saved: string[]; failed: Array<{ key: string; message: string }> }

/**
 * Saves each changed key independently and reports what actually happened. The
 * settings endpoint takes one key per request, so a batch can partly succeed; the
 * caller must not present that as "saved" or as "nothing saved".
 */
export async function saveSettingChanges(changes: Record<string, string>, save: (key: string, value: string) => Promise<void>, onProgress?: (done: number) => void): Promise<SaveOutcome> {
  const outcome: SaveOutcome = { saved: [], failed: [] };
  let done = 0;
  for (const [key, value] of Object.entries(changes)) {
    try {
      await save(key, value);
      outcome.saved.push(key);
    } catch (err) {
      outcome.failed.push({ key, message: (err as Error)?.message || "Not saved" });
    }
    onProgress?.(++done);
  }
  return outcome;
}

/** Message for the save bar after a save that had failures. */
export function failureMessage(outcome: SaveOutcome, labelFor: (key: string) => string): string {
  const names = outcome.failed.map(item => labelFor(item.key)).join(", ");
  if (!outcome.saved.length) return `Nothing was saved. ${outcome.failed.length === 1 ? "This change" : "These changes"} failed: ${names}.`;
  return `${outcome.saved.length} saved, ${outcome.failed.length} not saved: ${names}.`;
}

/**
 * Draft editing over the shared settings list. The draft holds only the keys the
 * user changed; the baseline is always the server's last response, re-fetched after
 * every save so "Discard" returns to what is actually stored.
 */
export function useSettingsDraft(id: string, include: (setting: EditableSetting) => boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: fetchSettings, staleTime: 0 });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<EditableSetting[]>([]);
  const [state, setState] = useState<SaveState>({ kind: "clean" });
  const [failedKeys, setFailedKeys] = useState<Record<string, string>>({});

  const settings = useMemo(() => {
    const stored = (query.data?.settings ?? []).filter(include);
    const extra = added.filter(spec => !stored.some(item => item.key === spec.key));
    return [...stored, ...extra];
    // `include` is a stable module-level predicate at every call site.
  }, [query.data, added]);

  const baseline = useMemo(() => Object.fromEntries(settings.map(item => [item.key, item.value])), [settings]);
  const changes = useMemo(() => Object.fromEntries(Object.entries(draft).filter(([key, value]) => (baseline[key] ?? "") !== value)), [draft, baseline]);
  const dirtyCount = Object.keys(changes).length;
  useUnsavedChanges(id, dirtyCount > 0);

  const value = (key: string) => draft[key] ?? baseline[key] ?? "";
  const setValue = useCallback((key: string, next: string) => {
    setDraft(prev => ({ ...prev, [key]: next }));
    setState(prev => prev.kind === "saving" ? prev : { kind: "dirty", count: 1 });
  }, []);

  const labelFor = (key: string) => settings.find(item => item.key === key)?.label || key;

  const save = async () => {
    const total = Object.keys(changes).length;
    if (!total) return;
    setState({ kind: "saving", done: 0, total });
    const outcome = await saveSettingChanges(changes, saveSetting, done => setState({ kind: "saving", done, total }));
    await queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    const failed = Object.fromEntries(outcome.failed.map(item => [item.key, item.message]));
    setFailedKeys(failed);
    // Saved keys leave the draft (the refreshed baseline now holds them); failed keys stay editable.
    setDraft(prev => Object.fromEntries(Object.entries(prev).filter(([key]) => key in failed)));
    setAdded(prev => prev.filter(spec => hasKey(failed, spec.key)));
    setState(outcome.failed.length ? { kind: "failed", message: failureMessage(outcome, labelFor), count: outcome.failed.length } : { kind: "saved" });
    if (!outcome.failed.length) window.setTimeout(() => setState(prev => prev.kind === "saved" ? { kind: "clean" } : prev), 2500);
  };

  const discard = () => { setDraft({}); setAdded([]); setFailedKeys({}); setState({ kind: "clean" }); };
  const addSetting = (spec: EditableSetting, initial: string) => { setAdded(prev => [...prev, spec]); setValue(spec.key, initial); };

  const barState: SaveState = state.kind === "saving" || state.kind === "saved" || state.kind === "failed" ? state : dirtyCount ? { kind: "dirty", count: dirtyCount } : { kind: "clean" };
  return { query, settings, value, setValue, changes, dirtyCount, save, discard, addSetting, state: barState, failedKeys, labelFor };
}

function hasKey(record: Record<string, string>, key: string) { return Object.prototype.hasOwnProperty.call(record, key); }
