export const PAYMENT_METHODS = ["Cash", "Card", "Link", "Bank Transfer", "Invoice", "Unknown"] as const;
export type ReportPaymentMethod = typeof PAYMENT_METHODS[number];
export function addReportMoney(a: number, b: number): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new RangeError("Report monetary sum exceeds exact integer precision; verify source data.");
  return result;
}
export function paymentMethod(raw: string): ReportPaymentMethod {
  const value = (raw || "").trim().toLowerCase();
  if (value === "cash") return "Cash";
  if (value === "card") return "Card";
  if (value === "link" || value === "payment link") return "Link";
  if (["bank", "bank transfer", "transfer"].includes(value)) return "Bank Transfer";
  if (value === "invoice") return "Invoice";
  return "Unknown";
}
export function validPence(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
export function poundsToReportPence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) ? result : null;
}
export function reportPayments(rows: Array<{ method: string; amountPence: number | null }> | undefined,
  legacy?: { method: string; amountPence: number | null; status?: string; invoiceExpectedPence?: number | null }) {
  const byMethod = Object.fromEntries(PAYMENT_METHODS.map(method => [method, 0])) as Record<ReportPaymentMethod, number>;
  const issues: string[] = [];
  if (!rows?.length) {
    if (legacy?.method && paymentMethod(legacy.method) === "Invoice") rows = [{ method: "Invoice", amountPence: legacy.amountPence }];
    else if (legacy && /^(paid|received|collected)$/i.test(legacy.status || "") && paymentMethod(legacy.method) !== "Unknown") rows = [{ method: legacy.method, amountPence: legacy.amountPence }];
    else issues.push("No verified split/payment receipt; a job price, paid-online flag or generated link is not proof of collection.");
  }
  for (const row of rows ?? []) {
    const method = paymentMethod(row.method);
    if (!validPence(row.amountPence)) { issues.push(`Unknown/invalid ${method} amount.`); continue; }
    byMethod[method] = addReportMoney(byMethod[method], row.amountPence);
    if (method === "Unknown") issues.push("Ambiguous or unrecognized payment method; Invoice/Transfer and combined labels cannot establish receipt.");
  }
  const knownCollectedPence = [byMethod.Cash, byMethod.Card, byMethod.Link, byMethod["Bank Transfer"]].reduce(addReportMoney, 0);
  const invoiceSelected = rows?.some(row => paymentMethod(row.method) === "Invoice");
  const invoiceDerived = invoiceSelected && byMethod.Invoice === 0 && !issues.length && validPence(legacy?.invoiceExpectedPence);
  if (invoiceDerived) byMethod.Invoice = Math.max(0, legacy!.invoiceExpectedPence! - knownCollectedPence);
  return { byMethod, knownCollectedPence, collectedPence: issues.length ? null : knownCollectedPence, invoicePence: byMethod.Invoice,
    invoiceBasis: invoiceDerived ? "derived-uncollected-bill-balance" : "recorded", issues };
}
export type PaymentLedger = ReturnType<typeof reportPayments>;
export function normalizedPayments(job: { paymentLedger?: PaymentLedger; paymentBreakdown?: Array<{ method?: string; amount: number }>; paymentMethod: string; amountCharged: number; paymentStatus?: string }) {
  return job.paymentLedger ?? reportPayments(job.paymentBreakdown?.map(row => ({ method: row.method || "", amountPence: row.amount })),
    { method: job.paymentMethod, amountPence: job.amountCharged, status: job.paymentStatus });
}
