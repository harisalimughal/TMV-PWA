import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";

// A read preference, never an authorization rule or a modification of stored data.
const scope = new AsyncLocalStorage<boolean>();
export const maExcluded = () => scope.getStore() === true;
export const driverScopeKey = () => maExcluded() ? "without-MA" : "all-drivers";
export const driverVisible = (initials: string | null | undefined) => !maExcluded() || String(initials || "").trim().toUpperCase() !== "MA";
export function rawJobVisible(job: { driverInitials?: string; reportIdentity?: { initials?: string }; timeBilling?: { driverInitials?: string } }) {
  return driverVisible(job.reportIdentity?.initials?.trim() || job.timeBilling?.driverInitials?.trim() || job.driverInitials);
}
export const withDriverScope = <T>(excludeMA: boolean, work: () => T): T => scope.run(excludeMA, work);

export const adminDriverScope: RequestHandler = (req, res, next) => {
  const preference = req.query.includeMA ?? req.get("X-TMV-Include-MA");
  const excluded = ["GET", "HEAD"].includes(req.method) && (preference === "false" || preference === "0");
  scope.run(excluded, () => {
    if (excluded && /^\/driver-reports\/MA(?:\/|$)/i.test(req.path)) {
      res.status(404).json({ error: { code: "DRIVER_EXCLUDED", message: "MA is excluded. Turn on Include MA to view or export this driver." } });
      return;
    }
    next();
  });
};
