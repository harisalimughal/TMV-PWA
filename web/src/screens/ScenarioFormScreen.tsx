import React, { useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { submitScenario } from "../api/jobs";
import { SCENARIOS, type ScenarioKey } from "../scenarioSpec";
import { PhotoPicker } from "../components/PhotoPicker";
import { SignaturePad, type SignaturePadHandle } from "../components/SignaturePad";

interface ScenarioFormScreenProps {
  jobId: string;
  scenario: ScenarioKey;
  onDone: () => void;
  onCancel: () => void;
}

export function ScenarioFormScreen({ jobId, scenario, onDone, onCancel }: ScenarioFormScreenProps) {
  const spec = SCENARIOS[scenario];
  const [fields, setFields] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [hasSignature, setHasSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  function setField(name: string, value: string) {
    setFields(prev => ({ ...prev, [name]: value }));
  }

  const missingRequired = spec.fields.some(f => f.required && !(fields[f.name] ?? "").trim());
  const canSubmit = !missingRequired && photos.length >= spec.photoMin && hasSignature;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const blob = await padRef.current?.toBlob();
      if (!blob) throw new Error("Couldn't read the signature. Try signing again.");
      await submitScenario(jobId, scenario, fields, photos, blob);
      onDone();
    } catch (err: any) {
      setError(err?.message || "Couldn't submit this form. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const conditionalNoticeVisible =
    spec.conditionalNotice && fields[spec.conditionalNotice.field] === spec.conditionalNotice.whenValue;

  return (
    <div className="h-screen-safe flex flex-col bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10 shrink-0">
        <button onClick={onCancel} className="text-white/60 hover:text-white/90 p-1 -ml-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-sm font-semibold">{spec.title}</div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-5">
        {spec.noticeText && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3.5 flex flex-col gap-1.5">
            {spec.noticeTitle && (
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold uppercase tracking-wide">
                <AlertTriangle className="w-3.5 h-3.5" />
                {spec.noticeTitle}
              </div>
            )}
            <p className="text-xs text-amber-100/80 leading-relaxed">{spec.noticeText}</p>
          </div>
        )}

        {spec.fields.map(field => (
          <React.Fragment key={field.name}>
            <FieldInput
              field={field}
              value={fields[field.name] ?? ""}
              onChange={value => setField(field.name, value)}
            />
            {spec.conditionalNotice?.field === field.name && conditionalNoticeVisible && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold uppercase tracking-wide">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {spec.conditionalNotice.title}
                </div>
                <p className="text-xs text-amber-100/80 leading-relaxed">{spec.conditionalNotice.text}</p>
              </div>
            )}
          </React.Fragment>
        ))}

        <PhotoPicker label={spec.photoLabel} max={spec.photoMax} onChange={setPhotos} />

        <div className="flex flex-col gap-2">
          {spec.signatureText && <p className="text-xs text-white/50 leading-relaxed">{spec.signatureText}</p>}
          <SignaturePad ref={padRef} onChange={setHasSignature} />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-dark transition-colors py-3.5 text-sm font-semibold disabled:opacity-40"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
    </div>
  );
}

function FieldInput({
  field, value, onChange
}: { field: (typeof SCENARIOS)[ScenarioKey]["fields"][number]; value: string; onChange: (value: string) => void }) {
  if (field.type === "yesno") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-white/60 pl-1">{field.label}</span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange("Yes")}
            className={`flex-1 rounded-xl border py-3 text-sm font-semibold transition-colors ${
              value === "Yes" ? "bg-brand/15 border-brand" : "bg-white/5 border-white/10"
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange("No")}
            className={`flex-1 rounded-xl border py-3 text-sm font-semibold transition-colors ${
              value === "No" ? "bg-brand/15 border-brand" : "bg-white/5 border-white/10"
            }`}
          >
            No
          </button>
        </div>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-white/60 pl-1">{field.label}</span>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm focus:outline-none focus:border-brand"
        >
          <option value="" disabled>
            Tap to select
          </option>
          {field.options?.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const inputType = field.type === "date" ? "date" : field.type === "tel" ? "tel" : field.type === "email" ? "email" : "text";
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-white/60 pl-1">{field.label}</span>
      <input
        type={inputType}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand"
      />
    </label>
  );
}
