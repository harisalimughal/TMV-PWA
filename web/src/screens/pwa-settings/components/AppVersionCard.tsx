import React from "react";
import { Tag } from "lucide-react";
import { APP_VERSION_LABEL, BUILD_ID } from "../../../lib/pwa/version";
import { SettingCard } from "./SettingCard";

/**
 * Section 5: the app version, from the single build-time source (`__APP_VERSION__`,
 * derived from package.json). The build identifier underneath is the git short SHA
 * (or build date) — useful when reporting an issue, and not sensitive.
 */
export function AppVersionCard() {
  return (
    <SettingCard icon={<Tag />} title="App Version">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-heading text-fg tabular-nums">{APP_VERSION_LABEL}</span>
        <span className="text-meta text-fg-subtle">
          Build <span className="font-mono">{BUILD_ID}</span>
        </span>
      </div>
    </SettingCard>
  );
}
