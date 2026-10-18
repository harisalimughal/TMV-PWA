import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, RotateCcw } from "lucide-react";
import { fetchMessages, saveMessageTemplate, toggleMessage, type MessageAudience, type MessageCatalogItem } from "../../api";
import { Modal } from "../../../../../ui/Modal";
import { Switch } from "../../../../../ui";
import { useToast } from "../../../../../components/ui/Toast";
import { cx } from "../../../../../ui/cx";
import { useUnsavedChanges } from "../../utils/unsavedChanges";
import { Action, Badge, ChoiceChips, EmptyState, ErrorState, LoadingState, Notice, controlBase } from "../ds";

/** Clearly fictional values used only to render previews. */
export const PREVIEW_VALUES: Record<string, string> = {
  "{customerName}": "Alex Sample", "{NAME}": "Alex Sample", "{companyName}": "The Man Van",
  "{pickup}": "1 Example Street, London", "{dropoff}": "2 Sample Road, London",
  "{driverPhone}": "07000 000000", "{vanRegistration}": "AB12 CDE", "{driver_name}": "Caio",
  "{job_time}": "9:00 AM", "{job_date}": "Monday 25 Aug", "{booking_date}": "Monday 25 Aug",
  "{leadMinutes}": "45", "{jobId}": "TMV-EXAMPLE01"
};

export function renderPreview(content: string, values: Record<string, string> = PREVIEW_VALUES): string {
  return Object.entries(values).reduce((text, [token, value]) => text.split(token).join(value), content);
}

/** `{tokens}` in the text that this message can't fill in; they would be sent literally. */
export function unknownTokens(text: string, allowed: string[]): string[] {
  const found = text.match(/\{[A-Za-z_][A-Za-z0-9_]*\}/g) ?? [];
  return Array.from(new Set(found.filter(token => !allowed.includes(token))));
}

const AUDIENCE_COPY: Record<MessageAudience, string> = {
  customer: "Messages the app sends to customers at each stage of a job.",
  driver: "Push, SMS and email messages the app sends to drivers."
};

export function MessageTemplates() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [audience, setAudience] = useState<MessageAudience>("customer");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["messages"], queryFn: fetchMessages });
  const items = query.data?.items ?? [];
  const visible = items.filter(item => item.audience === audience);
  const editing = items.find(item => item.id === editingId) ?? null;
  const count = (value: MessageAudience) => items.filter(item => item.audience === value).length;

  const toggle = async (item: MessageCatalogItem, enabled: boolean) => {
    setToggling(item.id);
    try {
      await toggleMessage(item.id, enabled);
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      toast.success(`${item.label} ${enabled ? "turned on" : "turned off"}.`);
    } catch (err) {
      toast.error(`${item.label} wasn't changed: ${(err as Error)?.message || "request failed"}.`);
    } finally { setToggling(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChoiceChips label="Message audience" value={audience} onChange={setAudience}
          options={[{ value: "customer", label: "Customer", count: count("customer") }, { value: "driver", label: "Driver", count: count("driver") }]} />
        <p className="text-[13px] text-admin-ink-2">{AUDIENCE_COPY[audience]}</p>
      </div>
      <Notice tone="info">Switching a message off stops its next send straight away. Template edits apply to messages sent after saving.</Notice>
      {query.isLoading ? <LoadingState label="Loading message templates" rows={5} /> :
        query.error ? <ErrorState title="Couldn't load message templates" message={(query.error as Error).message} onRetry={() => void query.refetch()} /> :
        !visible.length ? <EmptyState title="No messages for this audience" message="The message catalogue returned no templates." /> : (
        <ul className="divide-y divide-admin-line rounded-xl border border-admin-line bg-white">
          {visible.map(item => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[15px] font-semibold text-admin-ink">{item.label}</h3>
                  <Badge>{item.channel}</Badge>
                  <Badge tone={item.enabled ? "success" : "neutral"}>{item.enabled ? "On" : "Off"}</Badge>
                  {item.hasHtml && item.htmlEnabled && <Badge tone="info">HTML email</Badge>}
                </div>
                {item.hint && <p className="mt-0.5 text-[13px] text-admin-ink-2">{item.hint}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={item.enabled} disabled={toggling === item.id} onChange={enabled => void toggle(item, enabled)} aria-label={`${item.label}: ${item.enabled ? "on" : "off"}`} />
                <Action size="sm" icon={<Pencil />} onClick={() => setEditingId(item.id)} aria-label={`Edit ${item.label}`}>Edit</Action>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateEditor item={editing} onClose={() => setEditingId(null)}
        onSaved={() => { void queryClient.invalidateQueries({ queryKey: ["messages"] }); toast.success(`${editing.label} saved.`); setEditingId(null); }} />}
    </div>
  );
}

function TemplateEditor({ item, onClose, onSaved }: { item: MessageCatalogItem; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(item.title ?? "");
  const [body, setBody] = useState(item.body);
  const [html, setHtml] = useState(item.html ?? "");
  const [htmlEnabled, setHtmlEnabled] = useState(Boolean(item.htmlEnabled));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const dirty = body !== item.body || (item.hasTitle && title !== (item.title ?? "")) ||
    (item.hasHtml && (html !== (item.html ?? "") || htmlEnabled !== Boolean(item.htmlEnabled)));
  useUnsavedChanges(`template-${item.id}`, dirty);
  const unknown = unknownTokens([title, body, item.hasHtml ? html : ""].join("\n"), item.variables);
  const smsOver = item.channel === "SMS" && body.length > 160;
  const blocking = !body.trim() ? "The message can't be empty." : item.hasHtml && htmlEnabled && !html.trim() ? "Add HTML or turn off “Send as HTML”." : unknown.length ? `Remove or correct: ${unknown.join(", ")}.` : "";

  const insert = (token: string) => {
    const element = bodyRef.current;
    if (!element) { setBody(value => value + token); return; }
    const start = element.selectionStart ?? body.length;
    const end = element.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    window.requestAnimationFrame(() => { element.focus(); element.setSelectionRange(start + token.length, start + token.length); });
  };
  const reset = () => { setBody(item.bodyFallback); if (item.hasTitle) setTitle(item.titleFallback ?? ""); if (item.hasHtml) { setHtml(item.htmlFallback ?? ""); setHtmlEnabled(false); } };
  const save = async () => {
    setSaving(true); setError("");
    try {
      await saveMessageTemplate(item.id, { ...(item.hasTitle ? { title } : {}), body, ...(item.hasHtml ? { html, htmlEnabled } : {}) });
      onSaved();
    } catch (err) { setError((err as Error)?.message || "The template wasn't saved."); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={item.label} size="xl" dismissible={!saving}
      footer={<div className="flex w-full flex-wrap items-center justify-between gap-2">
        <Action variant="ghost" icon={<RotateCcw />} onClick={reset} disabled={saving}>Reset to default text</Action>
        <div className="flex gap-2"><Action variant="ghost" onClick={onClose} disabled={saving}>Cancel</Action>
          <Action variant="primary" loading={saving} disabled={!dirty || Boolean(blocking)} onClick={() => void save()}>Save template</Action></div>
      </div>}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <p className="text-[13px] text-admin-ink-2">{item.channel} to {item.audience === "customer" ? "customers" : "drivers"} · currently {item.enabled ? "on" : "off"}</p>
          {item.hasTitle && <label className="block text-[13px] font-medium text-admin-ink-2">Title<input value={title} onChange={event => setTitle(event.target.value)} className={cx(controlBase, "mt-1 w-full")} /></label>}
          <label className="block text-[13px] font-medium text-admin-ink-2">{item.hasHtml ? "Plain-text body" : "Message"}
            <textarea ref={bodyRef} value={body} onChange={event => setBody(event.target.value)} rows={7}
              className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 font-mono text-[13.5px] outline-none focus:border-admin-brand focus:ring-2 focus:ring-admin-brand/20" />
          </label>
          {item.channel === "SMS" && <p className={cx("text-[12.5px]", smsOver ? "font-semibold text-admin-status-amber" : "text-admin-ink-2")}>{body.length} characters{smsOver ? " — longer than one standard SMS (160) and may be split" : " of 160 for one standard SMS"}</p>}
          {item.variables.length > 0 && (
            <div>
              <p className="text-[13px] font-medium text-admin-ink-2">Insert a variable</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {item.variables.map(token => <button key={token} type="button" onClick={() => insert(token)} className="rounded-md border border-admin-line bg-admin-surface px-2 py-1 font-mono text-[12.5px] text-admin-ink hover:border-admin-brand">{token}</button>)}
              </div>
            </div>
          )}
          {item.hasHtml && (
            <details className="rounded-lg border border-admin-line p-3" open={htmlEnabled}>
              <summary className="cursor-pointer text-[14px] font-semibold text-admin-ink">Advanced: HTML email</summary>
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-[13.5px] text-admin-ink"><Switch checked={htmlEnabled} onChange={setHtmlEnabled} aria-label="Send as HTML" />Send as HTML (the plain-text body is used otherwise)</label>
                <textarea value={html} onChange={event => setHtml(event.target.value)} rows={8} spellCheck={false} aria-label="HTML source"
                  className="w-full rounded-lg border border-admin-line px-3 py-2 font-mono text-[12.5px] outline-none focus:border-admin-brand" />
              </div>
            </details>
          )}
          {blocking && <p role="alert" className="text-[13px] text-admin-status-red">{blocking}</p>}
          {error && <p role="alert" className="text-[13px] text-admin-status-red">{error}</p>}
        </div>
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-admin-ink-2">Preview with sample details</p>
          <div className="rounded-xl border border-admin-line bg-admin-surface p-4">
            {item.hasTitle && <p className="mb-1 text-[14.5px] font-semibold text-admin-ink">{renderPreview(title) || <span className="font-normal text-admin-muted">No title</span>}</p>}
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-admin-ink">{renderPreview(body) || <span className="text-admin-muted">Empty message</span>}</p>
          </div>
          {item.hasHtml && htmlEnabled && html.trim() && <iframe title={`${item.label} HTML preview`} sandbox="" srcDoc={renderPreview(html)} className="h-72 w-full rounded-xl border border-admin-line bg-white" />}
          <p className="text-[12px] text-admin-muted">Sample values only; no message is sent from this preview.</p>
        </div>
      </div>
    </Modal>
  );
}
