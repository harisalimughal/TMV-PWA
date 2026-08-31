import React from "react";
import {
  Ban,
  CheckCircle2,
  Compass,
  Download,
  Info,
  ListChecks,
  Share2,
} from "lucide-react";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { describeInstallStatus } from "../../../lib/pwa/install-status";
import type { InstallStatus } from "../../../lib/pwa/types";
import { SettingCard } from "./SettingCard";
import { StatusRow } from "./StatusRow";

const ICONS: Record<InstallStatus, React.ReactNode> = {
  installed: <CheckCircle2 aria-hidden />,
  installable: <Download aria-hidden />,
  "ios-safari": <Share2 aria-hidden />,
  "ios-other-browser": <Compass aria-hidden />,
  "needs-browser-menu": <Info aria-hidden />,
  unsupported: <Ban aria-hidden />,
};

/** Section 3: the derived installation state, as a single status row. */
export function InstallationStatusCard() {
  const { status } = usePwaInstall();
  const presentation = describeInstallStatus(status);

  return (
    <SettingCard icon={<ListChecks />} title="Installation Status">
      <StatusRow
        label="This device"
        value={presentation.label}
        tone={presentation.tone}
        icon={ICONS[status]}
        hint={presentation.detail}
      />
    </SettingCard>
  );
}
