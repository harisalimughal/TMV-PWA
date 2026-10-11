import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { reportReturnHref } from "../utils/reportNavigation";

export function ReportReturnButton({ compact = false }: { compact?: boolean }) {
  const [href, setHref] = useState(reportReturnHref);
  useEffect(() => {
    const read = () => setHref(reportReturnHref());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  if (!href) return null;
  return <button type="button" title="Back to Driver Breakdown" aria-label="Back to Driver Breakdown"
    className="no-print inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-admin-line bg-white px-3 py-2 text-[13px] font-medium text-admin-brand hover:bg-admin-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-brand"
    onClick={() => { const target = reportReturnHref(); if (!target) return; window.history.replaceState({}, "", target); window.dispatchEvent(new PopStateEvent("popstate")); }}>
    <ArrowLeft className="h-4 w-4 shrink-0" /><span className={compact ? "hidden sm:inline" : ""}>Back to Driver Breakdown</span>
  </button>;
}
