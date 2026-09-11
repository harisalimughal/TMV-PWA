import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, CloudOff, MapPin, Search, X } from "lucide-react";
import { fetchLiabilityDamageCategories, submitScenario, type ApiError } from "../api/jobs";
import { MULTISELECT_DELIMITER, SCENARIOS, type ScenarioFieldSpec, type ScenarioKey } from "../scenarioSpec";
import { PhotoPicker } from "../components/PhotoPicker";
import { formatCapturedTime, formatLocationLabel, mapsUrlForLocation, type PhotoCaptureMeta } from "../lib/geo";
import { SignatureField } from "../components/SignatureField";
import { SignatureModal } from "../components/SignatureModal";
import { useToast } from "../components/ui/Toast";
import { AppShell } from "../app/AppShell";
import { OfflineBanner } from "../app/OfflineBanner";
import {
  Alert,
  BottomActionBar,
  Button,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
  Section,
  Select,
  cx
} from "../ui";
import { useOnline } from "../lib/net";
import type { StorageSummary } from "./StorageCompletionScreen";

interface ScenarioFormScreenProps {
  /** Present only for job-scoped scenarios (Parking Liability / Liability Report). */
  jobId?: string;
  scenario: ScenarioKey;
  /** Booking context for job-scoped scenarios. Pre-fills the customer's name instead
   *  of asking the driver to retype what we already know. */
  job?: { customerName?: string };
  /**
   * Which checkpoint of the move this report is being filed from — inferred from the
   * workflow step that opened the form, not asked of the driver. Defaults Parking
   * Liability's address choice, and for every job-scoped scenario is recorded on the
   * submission as `reported_at` (even for Liability Report, which has no address field
   * of its own) so admin can see where in the move it was reported, including a
   * stop-by / waypoint address.
   */
  reportedAt?: { label: "Pickup" | "Stop-by" | "Drop-off"; address?: string };
  /** For a standalone storage form, resolves with a summary for the completion
   *  screen. For a job-scoped scenario it resolves with nothing. */
  onDone: (result?: { summary: StorageSummary }) => void;
  onCancel: () => void;
}

/** Which section heading each storage field sits under. Anything unlisted (the
 *  job-scoped parking / liability fields) falls back to "Details". */
const FIELD_SECTION: Record<string, string> = {
  container_number: "Container",
  client_name: "Customer details",
  client_phone: "Customer details",
  client_email: "Customer details",
  client_present: "Details",
  date: "Details"
};

function groupFields(fields: ScenarioFieldSpec[]): Array<{ title: string; fields: ScenarioFieldSpec[] }> {
  const groups: Array<{ title: string; fields: ScenarioFieldSpec[] }> = [];
  for (const field of fields) {
    const title = FIELD_SECTION[field.name] ?? "Details";
    const group = groups.find(g => g.title === title);
    if (group) group.fields.push(field);
    else groups.push({ title, fields: [field] });
  }
  return groups;
}

function scenarioOptions(spec: { fields: ScenarioFieldSpec[] }): string[] {
  return spec.fields.find(field => field.name === "damage_categories")?.options ?? [];
}

function todayInLondon(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string): boolean {
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function ScenarioFormScreen({
  jobId,
  scenario,
  job,
  reportedAt,
  onDone,
  onCancel
}: ScenarioFormScreenProps) {
  const baseSpec = SCENARIOS[scenario];
  const [liabilityCategories, setLiabilityCategories] = useState(() => scenarioOptions(SCENARIOS.liability));
  const spec = useMemo(() => {
    if (scenario !== "liability") return baseSpec;
    return {
      ...baseSpec,
      fields: baseSpec.fields.map(field =>
        field.name === "damage_categories" ? { ...field, options: liabilityCategories } : field
      )
    };
  }, [baseSpec, liabilityCategories, scenario]);
  const needsSignature = Boolean(spec.signatureText) || scenario === "parking";
  const storageKind: "checkin" | "checkout" | null =
    !jobId && (scenario === "checkin" || scenario === "checkout") ? scenario : null;
  const fieldGroups = useMemo(() => groupFields(spec.fields), [spec.fields]);

  useEffect(() => {
    if (scenario !== "liability") return;
    let cancelled = false;
    setLiabilityCategories(scenarioOptions(SCENARIOS.liability));
    fetchLiabilityDamageCategories()
      .then(categories => {
        if (!cancelled && categories.length > 0) setLiabilityCategories(categories);
      })
      .catch(() => {
        if (!cancelled) setLiabilityCategories(scenarioOptions(SCENARIOS.liability));
      });
    return () => {
      cancelled = true;
    };
  }, [scenario]);

  const [fields, setFields] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of spec.fields) {
      if (field.type === "date") initial[field.name] = todayInLondon();
    }
    // Pre-fill what the booking already tells us for job-scoped scenarios.
    const customerName = job?.customerName?.trim();
    if (customerName && spec.fields.some(f => f.name === "client_name")) {
      initial.client_name = customerName;
    }
    return initial;
  });
  const [photos, setPhotos] = useState<File[]>([]);
  // Parallel to `photos` -- where/when each was taken (null for library uploads).
  const [photoMeta, setPhotoMeta] = useState<Array<PhotoCaptureMeta | null>>([]);
  // Every scenario form docks the camera next to Submit — the built-in "Take photo"
  // button is hidden and triggered from here instead.
  const openCameraRef = useRef<(() => void) | null>(null);
  const registerCapture = useCallback((open: (() => void) | null) => {
    openCameraRef.current = open;
  }, []);
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const toast = useToast();
  const online = useOnline();

  const hasSignature = signatureBlob !== null;
  // The most recent capture worth showing a caption for -- older/removed photos with
  // no recorded location just show nothing rather than a misleading blank line.
  const captureCaption = photoMeta.length > 0 ? photoMeta[photoMeta.length - 1] : null;

  // Revoke the preview object URL when it's replaced or the screen unmounts.
  useEffect(() => {
    if (!signaturePreviewUrl) return;
    return () => URL.revokeObjectURL(signaturePreviewUrl);
  }, [signaturePreviewUrl]);

  function setField(name: string, value: string) {
    setFields(prev => ({ ...prev, [name]: value }));
  }

  function handleSignatureSave(blob: Blob) {
    setSignatureBlob(blob);
    setSignaturePreviewUrl(URL.createObjectURL(blob));
    setSignatureModalOpen(false);
  }

  function handleSignatureClear() {
    setSignatureBlob(null);
    setSignaturePreviewUrl(null);
  }

  /** Every unmet requirement, in the order it appears on screen. Drives the reason
   *  surfaced when the blocked submit is tapped, and the jump-to-first-problem. */
  const problems = useMemo(() => {
    const list: Array<{ key: string; message: string }> = [];

    for (const field of spec.fields) {
      const value = (fields[field.name] ?? "").trim();
      if (field.required && !value) {
        list.push({ key: field.name, message: `${field.label} is needed` });
        continue;
      }
      if (!value) continue;
      if (field.type === "email" && !isValidEmail(value)) {
        list.push({ key: field.name, message: `${field.label} doesn't look like an email address` });
      }
      if (field.type === "tel" && !isValidPhone(value)) {
        list.push({ key: field.name, message: `${field.label} doesn't look like a phone number` });
      }
    }

    if (photos.length < spec.photoMin) {
      const missing = spec.photoMin - photos.length;
      list.push({
        key: "photos",
        message: spec.photoMin === 1 ? "A photo is needed" : `${missing} more photo${missing === 1 ? "" : "s"} needed`
      });
    }

    if (needsSignature && !hasSignature) {
      list.push({ key: "signature", message: "The customer needs to sign" });
    }

    return list;
  }, [fields, photos.length, hasSignature, spec, needsSignature]);

  const dirty =
    photos.length > 0 ||
    hasSignature ||
    spec.fields.some(f => (fields[f.name] ?? "").trim() !== "" && f.type !== "date");

  function handleBack() {
    if (dirty) setConfirmDiscard(true);
    else onCancel();
  }

  function jumpToProblem() {
    const first = problems[0];
    if (!first) return;
    toast.error(first.message);
    sectionRefs.current[first.key]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleSubmit() {
    if (problems.length > 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (needsSignature && !signatureBlob) {
        throw new Error("Couldn't read the signature. Open the signature pad and try again.");
      }

      // Where the report was actually filed from — carried on every job-scoped
      // submission (parking AND liability, which has no address field of its own) so
      // admin can see it, including a stop-by / waypoint address. Not a form field the
      // driver fills in; it's inferred from the workflow step that opened this form.
      const submissionFields = reportedAt
        ? {
            ...fields,
            reported_at: reportedAt.address ? `${reportedAt.label} — ${reportedAt.address}` : reportedAt.label
          }
        : fields;

      const result = await submitScenario(
        scenario,
        submissionFields,
        photos,
        signatureBlob ?? null,
        {
          jobId,
          label: jobId ? `${spec.title} — Job ${jobId}` : spec.title,
          onProgress: setProgress
        },
        photoMeta
      );

      if (result === "queued") {
        toast.success(`${spec.title} saved on this phone. It'll send as soon as you have signal.`);
      } else {
        toast.success(`${spec.title} submitted`);
      }

      if (storageKind) {
        onDone({
          summary: {
            scenario: storageKind,
            container: (fields.container_number ?? "").trim(),
            clientName: (fields.client_name ?? "").trim(),
            date: fields.date ?? "",
            photoCount: photos.length,
            clientPresent: fields.client_present ?? "",
            queued: result === "queued"
          }
        });
      } else {
        onDone();
      }
    } catch (err) {
      setError((err as ApiError)?.message || "Couldn't submit this form. Try again.");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  const conditionalNotice =
    spec.conditionalNotice &&
    (fields[spec.conditionalNotice.field] ?? "")
      .split(MULTISELECT_DELIMITER)
      .includes(spec.conditionalNotice.whenValue)
      ? spec.conditionalNotice
      : null;

  const agreementText = conditionalNotice?.text ?? spec.signatureText;
  const signerName = fields.client_name?.trim() || undefined;

  const headerSubtitle = storageKind
    ? storageKind === "checkin"
      ? "Record items being placed into storage."
      : "Record items being released from storage."
    : jobId
      ? `Job ${jobId}`
      : "Storage form";

  const submitVerb = storageKind === "checkin" ? "check in" : storageKind === "checkout" ? "check out" : null;
  const idleSubmitLabel = !online
    ? "Save & send later"
    : submitVerb
      ? `Complete ${submitVerb}`
      : "Submit";
  const busySubmitLabel =
    progress !== null
      ? `${submitVerb ? "Completing" : "Sending"} ${Math.round(progress * 100)}%`
      : submitVerb
        ? `Completing ${submitVerb}…`
        : "Sending…";

  return (
    <>
      <AppShell
        contentRef={contentRef}
        header={
          <PageHeader
            title={spec.title}
            subtitle={headerSubtitle}
            onBack={handleBack}
            backLabel="Discard and go back"
          />
        }
        banner={<OfflineBanner />}
        dock={
          <BottomActionBar
            note={
              problems.length > 0
                ? `${problems.length} thing${problems.length === 1 ? "" : "s"} still needed`
                : undefined
            }
            noteTone="warning"
          >
            {/* Take photo (left) + Submit (right) — same docked, side-by-side pattern
                as the job workflow's photo steps, for every scenario form. */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                size="lg"
                className="!rounded-[10px]"
                iconLeft={<Camera aria-hidden />}
                disabled={submitting || photos.length >= spec.photoMax}
                onClick={() => openCameraRef.current?.()}
              >
                {photos.length === 0 ? "Take photo" : "Take another"}
              </Button>
              <Button
                size="lg"
                className="!rounded-[10px]"
                loading={submitting}
                blockedReason={problems[0]?.message}
                onBlocked={jumpToProblem}
                onClick={() => void handleSubmit()}
                iconLeft={!online ? <CloudOff /> : undefined}
              >
                {submitting ? busySubmitLabel : idleSubmitLabel}
              </Button>
            </div>
          </BottomActionBar>
        }
      >
        <div className="flex flex-col gap-7 px-4 py-5">
          {spec.noticeText && <NoticeCard title={spec.noticeTitle} text={spec.noticeText} />}

          {!online && (
            <Alert tone="warning">
              No signal — keep going. This form is saved on the phone when you submit and sends the next time
              you're online.
            </Alert>
          )}

          {fieldGroups.map(group => (
            <Section key={group.title} title={group.title}>
              <div className="flex flex-col gap-4">
                {group.fields.map(field => (
                  <div
                    key={field.name}
                    ref={node => {
                      sectionRefs.current[field.name] = node;
                    }}
                  >
                    <FieldRow
                      field={field}
                      value={fields[field.name] ?? ""}
                      onChange={value => setField(field.name, value)}
                    />
                  </div>
                ))}
              </div>
            </Section>
          ))}

          <Section title="Evidence">
            <div
              ref={node => {
                sectionRefs.current.photos = node;
              }}
            >
              <PhotoPicker
                label={spec.photoLabel}
                hint={spec.photoMin > 0 ? `At least ${spec.photoMin} required` : undefined}
                min={spec.photoMin}
                max={spec.photoMax}
                onChange={(next, metas) => {
                  setPhotos(next);
                  setPhotoMeta(metas);
                }}
                registerCapture={registerCapture}
              />
              {/* Small, quiet proof-of-place line -- where/when the most recently taken
                  photo was, not shown at all when nothing's been captured yet. Time and
                  location on their own lines rather than crammed onto one. */}
              {captureCaption && (
                <div className="mt-3 flex flex-col gap-0.5 text-helper text-fg-subtle">
                  {formatCapturedTime(captureCaption.capturedAt) && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      Captured {formatCapturedTime(captureCaption.capturedAt)}
                    </p>
                  )}
                  {captureCaption.location ? (
                    <a
                      href={mapsUrlForLocation(captureCaption.location)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={event => event.stopPropagation()}
                      className="pl-5 text-brand underline underline-offset-2"
                    >
                      {formatLocationLabel(captureCaption.location, captureCaption.locationName)}
                    </a>
                  ) : (
                    <span className="pl-5">Location unavailable</span>
                  )}
                </div>
              )}
            </div>
          </Section>

          {needsSignature && (
            <Section title="Confirmation">
              <div
                className="flex flex-col gap-3"
                ref={node => {
                  sectionRefs.current.signature = node;
                }}
              >
                {conditionalNotice && <NoticeCard title={conditionalNotice.title} text={conditionalNotice.text} />}
                {spec.signatureText && (
                  <div className="rounded-card border border-line bg-surface px-4 py-4">
                    <p className="mb-2 text-eyebrow uppercase text-fg-subtle">
                      Please read before signing
                    </p>
                    <p className="text-body text-fg">{spec.signatureText}</p>
                  </div>
                )}
                <SignatureField
                  signed={hasSignature}
                  previewUrl={signaturePreviewUrl}
                  onOpen={() => setSignatureModalOpen(true)}
                  onClear={handleSignatureClear}
                  instruction="The customer signs to accept the terms above."
                />
              </div>
            </Section>
          )}

          {error && <Alert tone="danger">{error}</Alert>}

          <div className="scroll-pb-dock" aria-hidden />
        </div>
      </AppShell>

      <SignatureModal
        open={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        onSave={handleSignatureSave}
        title="Customer signature"
        instruction="Ask the customer to read the terms, then sign below."
        agreementText={agreementText}
        signerName={signerName}
      />

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={onCancel}
        title={`Discard this ${spec.title.toLowerCase()}?`}
        body="Everything you've entered, including the photos and any signature, will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
      />
    </>
  );
}

/* ---------------------------------------------------------------------- notices --- */

function NoticeCard({ title, text }: { title?: string; text: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-warning-line bg-warning-subtle px-4 py-4">
      {title && (
        <div className="flex items-center gap-1.5 text-eyebrow uppercase text-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {title}
        </div>
      )}
      {/* This is the legally operative copy the customer is asked to accept — kept at a
          comfortable reading size, not the smallest text on the screen. */}
      <p className="text-body text-fg">{text}</p>
    </div>
  );
}

/* ----------------------------------------------------------------------- fields --- */

function FieldRow({
  field,
  value,
  onChange
}: {
  field: ScenarioFieldSpec;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "yesno") {
    return <PresenceSelector field={field} value={value} onChange={onChange} />;
  }

  if (field.type === "multiselect") {
    return <MultiSelectField field={field} value={value} onChange={onChange} />;
  }

  if (field.type === "select") {
    return (
      <Field label={field.label} required={field.required}>
        {p => (
          <Select {...p} placeholder="Tap to select" value={value} onChange={e => onChange(e.target.value)}>
            {field.options?.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        )}
      </Field>
    );
  }

  const inputType =
    field.type === "date" ? "date" : field.type === "tel" ? "tel" : field.type === "email" ? "email" : "text";

  return (
    <Field label={field.label} required={field.required}>
      {p => (
        <Input
          {...p}
          type={inputType}
          inputMode={field.type === "tel" ? "tel" : field.type === "email" ? "email" : undefined}
          autoCapitalize={field.type === "email" ? "none" : "words"}
          autoCorrect={field.type === "email" ? "off" : undefined}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

/**
 * A two-option segmented radiogroup for "Is the client present?". "Yes" reads as a
 * positive confirmation (subtle green); "No" is a firm neutral navy selection — not
 * an error. Roving tabindex + arrow keys, real radio semantics.
 */
function PresenceSelector({
  field,
  value,
  onChange
}: {
  field: ScenarioFieldSpec;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = ["Yes", "No"] as const;
  const activeIndex = value === "No" ? 1 : value === "Yes" ? 0 : -1;

  function onKeyDown(event: React.KeyboardEvent) {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
    onChange(options[next]);
  }

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 pl-0.5 text-label text-fg-muted">
        {field.label}
        {field.required && <span className="ml-0.5 text-danger">*</span>}
      </legend>
      <div
        role="radiogroup"
        aria-label={field.label}
        aria-required={field.required || undefined}
        onKeyDown={onKeyDown}
        className="grid grid-cols-2 gap-2.5"
      >
        {options.map((option, i) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (activeIndex === -1 && i === 0) ? 0 : -1}
              onClick={() => onChange(option)}
              className={cx(
                "flex min-h-control-lg items-center justify-center gap-2 rounded-control border text-button",
                "transition duration-fast ease-out active:scale-[0.99]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                selected && option === "Yes" && "border-success bg-success-subtle text-success",
                selected && option === "No" && "border-fg bg-fg text-bg",
                !selected && "border-line bg-surface text-fg hover:bg-surface-sunken"
              )}
            >
              {selected && option === "Yes" && <Check className="size-4 stroke-[2.5]" aria-hidden />}
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The damage-category picker: filter instead of scroll, selected items shown as
 * removable chips up top, grows with the page rather than trapping a nested scroll.
 */
function MultiSelectField({
  field,
  value,
  onChange
}: {
  field: ScenarioFieldSpec;
  value: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => (value ? value.split(MULTISELECT_DELIMITER) : []), [value]);
  const options = field.options ?? [];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(option => option.toLowerCase().includes(needle));
  }, [options, query]);

  function toggle(option: string) {
    const next = selected.includes(option) ? selected.filter(v => v !== option) : [...selected, option];
    onChange(next.join(MULTISELECT_DELIMITER));
  }

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="pl-0.5 text-label text-fg-muted">
        {field.label}
        {field.required && <span className="ml-0.5 text-danger">*</span>}
      </legend>

      {selected.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {selected.map(option => (
            <li key={option}>
              <button
                type="button"
                onClick={() => toggle(option)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-pill bg-brand py-1.5 pl-3 pr-2 text-meta font-medium text-brand-fg active:scale-95"
              >
                <span className="truncate">{option}</span>
                <X className="size-3.5 shrink-0" aria-hidden />
                <span className="sr-only">Remove</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        prefix={<Search />}
        placeholder={`Search ${options.length} categories`}
        aria-label={`Search ${field.label}`}
      />

      {visible.length === 0 ? (
        <p className="px-1 py-2 text-helper text-fg-subtle">No category matches “{query}”.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line">
          {visible.map(option => (
            <Checkbox
              key={option}
              label={option}
              checked={selected.includes(option)}
              onChange={() => toggle(option)}
              className="w-full px-3.5 transition-colors hover:bg-surface-sunken/60"
            />
          ))}
        </div>
      )}

      <p className="pl-0.5 text-meta text-fg-subtle" aria-live="polite">
        {selected.length} selected
      </p>
    </fieldset>
  );
}
