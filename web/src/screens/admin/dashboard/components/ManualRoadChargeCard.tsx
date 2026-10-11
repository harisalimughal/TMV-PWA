import type { ReportManual, ReportSummary } from "../driverReport.types";

type Totals = NonNullable<ReportSummary["manualRoadChargeTotals"]>["tunnel"];
export function manualRoadFee(manual: ReportManual | null, type: "tunnel" | "congestion"): number | null {
  if (!manual) return null;
  if (!manual.chargeItems) {
    if (type !== "congestion") return null;
    if (manual.congestionCharge === false) return 0;
    const amount = manual.congestionChargePence;
    return manual.congestionCharge === true && Number.isSafeInteger(amount) && amount! >= 0 ? amount! : null;
  }
  const items = manual.chargeItems.filter(row => row.type === type);
  if (items.some(row => !Number.isSafeInteger(row.amountPence) || row.amountPence! < 0)) return null;
  const amount = items.reduce((total, row) => total + row.amountPence!, 0);
  return Number.isSafeInteger(amount) ? amount : null;
}
export function ManualRoadChargeCard({ totals }: { totals?: Totals }) {
  const amount = totals?.knownJobs ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.knownPence / 100)
    : totals?.missingJobs && !totals.unavailableJobs ? "Not submitted" : "Unavailable";
  return <div className="rpt-metric"><div className="rpt-metric-label">Manual Entry</div><small className="rpt-metric-caption">(reported)</small><strong>{amount}</strong>
    {!!totals?.missingJobs && <small className="rpt-unavailable-count">{totals.missingJobs} missing {totals.missingJobs === 1 ? "entry" : "entries"}</small>}
    {!!totals?.unavailableJobs && <small className="rpt-unavailable-count">{totals.unavailableJobs} unavailable job {totals.unavailableJobs === 1 ? "charge" : "charges"}</small>}
  </div>;
}
