export interface ScenarioPoint {
  point: string;
  full: string;
}

type ScenarioPointSource = {
  reportedAt?: string;
  reportedAtPoint?: string;
  fields?: Record<string, string | undefined>;
  rawRecord?: Record<string, string | undefined>;
  "Reported At"?: string;
  reported_at?: string;
};

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
