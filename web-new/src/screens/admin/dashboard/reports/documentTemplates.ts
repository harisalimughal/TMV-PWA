/**
 * Document templates for the printable Liability records.
 *
 * The legal wording is not copied here. It is read from `src/scenarioSpec.ts`, which
 * mirrors the backend's `workflow/scenario.spec.ts` and is the exact text the driver
 * app shows the customer before they sign. One source means the PDF cannot drift from
 * what was signed. Each scenario keeps its own wording; nothing is shared between them.
 *
 * Scenario records do not store a template version, so a PDF printed today shows the
 * wording in the current spec. `version` is bumped whenever that wording changes, and
 * the PDF prints it with the generation time so a later reprint is never presented as
 * the original document.
 */
import { SCENARIOS, type ScenarioKey } from "../../../../scenarioSpec";

export type DocumentTemplateId = "liability_check_in" | "liability_check_out" | "parking_liability" | "liability_report";

export interface DocumentTemplate {
  id: DocumentTemplateId;
  version: number;
  scenario: ScenarioKey;
  title: string;
  /** Shown above the details, as the driver app shows it before the form. */
  notice?: { title: string; text: string };
  /** The sentence the customer signed under, verbatim. */
  declaration?: string;
  /** Extra signed wording that applies only when a recorded answer matches. */
  conditionalNotice?: { field: string; whenValue: string; title: string; text: string };
  requiredFields: string[];
  signature: "client" | "none";
}

const spec = SCENARIOS;
const required = (key: ScenarioKey) => spec[key].fields.filter(field => field.required).map(field => field.name);

export const DOCUMENT_TEMPLATES: Record<ScenarioKey, DocumentTemplate> = {
  checkin: { id: "liability_check_in", version: 1, scenario: "checkin", title: "Storage Check-in", declaration: spec.checkin.signatureText, requiredFields: required("checkin"), signature: "client" },
  checkout: { id: "liability_check_out", version: 1, scenario: "checkout", title: "Storage Check-out", declaration: spec.checkout.signatureText, requiredFields: required("checkout"), signature: "client" },
  parking: {
    id: "parking_liability", version: 1, scenario: "parking", title: "Parking Liability Notice",
    notice: spec.parking.noticeTitle && spec.parking.noticeText ? { title: spec.parking.noticeTitle, text: spec.parking.noticeText } : undefined,
    requiredFields: required("parking"), signature: "client"
  },
  liability: { id: "liability_report", version: 1, scenario: "liability", title: "Liability Report", declaration: spec.liability.signatureText, conditionalNotice: spec.liability.conditionalNotice, requiredFields: required("liability"), signature: "client" }
};

export function templateFor(kind: string): DocumentTemplate | null {
  return (DOCUMENT_TEMPLATES as Record<string, DocumentTemplate>)[kind] ?? null;
}

/** True when the recorded multiselect answer contains the trigger value. */
export function conditionalNoticeApplies(template: DocumentTemplate, recorded: string | undefined | null): boolean {
  if (!template.conditionalNotice || !recorded) return false;
  return recorded.split(/\s*[|,]\s*/).some(part => part.trim() === template.conditionalNotice!.whenValue);
}

/**
 * The wording a record was signed under, when the record stores it. Older records do
 * not, so the PDF falls back to the current template and says so; it never presents
 * today's wording as the signed original. `declarationSnapshot` is the optional field
 * proposed for the backend (docs/FINAL_AUDIT.md): template id, version and the exact
 * text captured at signing.
 */
export interface DeclarationSnapshot { templateId?: string; version?: number | string; text: string; signedAt?: string }

export function storedDeclaration(record: unknown): DeclarationSnapshot | null {
  const value = (record as { declarationSnapshot?: unknown } | null)?.declarationSnapshot;
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<DeclarationSnapshot>;
  return typeof snapshot.text === "string" && snapshot.text.trim() ? { ...snapshot, text: snapshot.text } as DeclarationSnapshot : null;
}

export function wordingProvenance(template: DocumentTemplate | null, kind: string, snapshot: DeclarationSnapshot | null): string {
  if (snapshot) return `Wording: as stored with the record at signing (template ${snapshot.templateId ?? template?.id ?? kind}${snapshot.version !== undefined ? ` v${snapshot.version}` : ""}).`;
  return `Wording: current template ${template?.id ?? kind} v${template?.version ?? 1}. This record does not store the wording shown when it was signed; if the template changed since, the signed wording may differ.`;
}
