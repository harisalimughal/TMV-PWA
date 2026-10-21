import React from "react";
import { setIncludeMA, useIncludeMA } from "../../../../lib/adminDriverScope";
import { guardNavigation } from "../utils/unsavedChanges";

export function IncludeMaToggle() {
  const include = useIncludeMA();
  return <label title="Include or exclude MA (MAN VAN) on Overview only. Driver performance has its own switch. Records are kept unchanged."
    className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-admin-line bg-surface px-2 py-1.5 text-[11px] font-semibold text-admin-ink-2">
    <span>Include MA</span>
    <input type="checkbox" role="switch" aria-label="Include MA driver data" checked={include}
      className="h-3.5 w-3.5 accent-admin-brand" onChange={() => guardNavigation(() => {
        setIncludeMA(!include);
      })} />
  </label>;
}
