import React from "react";
import { ChevronDown, Stethoscope } from "lucide-react";
import { usePwaDiagnostics } from "../hooks/usePwaDiagnostics";
import type { PwaDiagnostics } from "../../../lib/pwa/types";

function rows(d: PwaDiagnostics): Array<[string, string]> {
  return [
    ["Service worker", d.serviceWorker === "active" ? "Active" : d.serviceWorker === "inactive" ? "Inactive" : "Unsupported"],
    ["Display mode", d.displayMode === "standalone" ? "Standalone" : "Browser"],
    ["Platform", d.platform.charAt(0).toUpperCase() + d.platform.slice(1)],
    ["Online", d.online ? "Yes" : "No"],
    ["Notification permission", d.notificationPermission],
    ["Install prompt available", d.installPromptAvailable ? "Yes" : "No"],
    ["Offline readiness", d.offlineReadiness],
    ["App version", d.appVersion],
    ["Build", d.buildId],
  ];
}

/**
 * Section 9: an unobtrusive collapsible troubleshooting readout. Native `<details>`
 * so it's keyboard-accessible for free. Capability/status values only — no tokens,
 * URLs, IDs or account data.
 */
export function DiagnosticsSection() {
  const diagnostics = usePwaDiagnostics();

  return (
    <details className="group rounded-card border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 p-4 text-label text-fg-muted [&::-webkit-details-marker]:hidden">
        <Stethoscope className="size-[18px] shrink-0 text-fg-subtle" aria-hidden />
        <span className="flex-1">App Diagnostics</span>
        <ChevronDown
          className="size-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <dl className="border-t border-line px-4 py-3 text-meta">
        {rows(diagnostics).map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5 last:border-0"
          >
            <dt className="text-fg-subtle">{label}</dt>
            <dd className="font-mono text-fg-muted">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
