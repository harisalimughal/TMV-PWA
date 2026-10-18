export interface ScenarioPoint {
  point: string;
  full: string;
}

type ScenarioPointSource = {
  address?: string;
  Address?: string;
  reportedAt?: string;
  reportedAtPoint?: string;
  fields?: Record<string, string | undefined>;
  rawRecord?: Record<string, string | undefined>;
  "Reported At"?: string;
  reported_at?: string;
};

/** Read the location captured with the submission, never a later job address. */
export function scenarioAddressFromRecord(record: ScenarioPointSource | null | undefined): string {
  if (!record) return "";
  const explicit = [record.address, record.Address, record.fields?.address, record.fields?.Address, record.rawRecord?.address, record.rawRecord?.Address]
    .find(value => typeof value === "string" && value.trim());
  if (explicit) return explicit.trim();
  const reported = scenarioPointFromRecord(record)?.full || "";
  return reported.match(/^(?:Pickup|Drop-off|Stop-by)\s+[—-]\s+([\s\S]+)$/i)?.[1]?.trim() || "";
}

export function scenarioPointFromRecord(record: ScenarioPointSource | null | undefined): ScenarioPoint | null {
  if (!record) return null;
  const raw =
    record.reportedAt ||
    record.reported_at ||
    record["Reported At"] ||
    record.fields?.reported_at ||
    record.fields?.["Reported At"] ||
    record.rawRecord?.reported_at ||
    record.rawRecord?.["Reported At"] ||
    "";
  const full = raw.trim();
  if (!full) return null;
  const point = (record.reportedAtPoint || full.split(/\s+[—-]\s+/)[0] || "").trim();
  return point ? { point, full } : null;
}
