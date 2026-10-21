import React from "react";
import { LoaderCircle } from "lucide-react";

export function TrackerLoading() {
  return <span className="inline-flex items-center gap-1.5 text-[12.5px] font-normal text-admin-ink-2"><LoaderCircle aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin" />Loading GPS…</span>;
}
