import React from "react";
import { CheckCircle2, LocateFixed, MapPinOff, RefreshCw } from "lucide-react";
import { Alert, Button } from "../../../ui";
import { getPlatform } from "../../../lib/pwa/platform";
import type { LocationPermissionState } from "../../../lib/pwa/types";
import { useToast } from "../../../components/ui/Toast";
import { useLocationPermission } from "../hooks/useLocationPermission";
import { SettingCard } from "./SettingCard";
import { StatusRow } from "./StatusRow";

function blockedGuidance(): string {
  switch (getPlatform()) {
    case "ios":
      return "Open chat.themanvan.co.uk in Safari, allow Location for the site, then reopen the TMV app. Also make sure iPhone Settings > Privacy & Security > Location Services is on.";
    case "android":
      return "Open chat.themanvan.co.uk in your browser, open site settings, set Location to Allow, then return to the TMV app. Also make sure device Location is on.";
    default:
      return "Open chat.themanvan.co.uk in your browser, click the padlock or tune icon next to the address bar, then set Location to Allow.";
  }
}

function statusLabel(permission: LocationPermissionState): string {
  switch (permission) {
    case "granted":
      return "Location Allowed";
    case "denied":
      return "Location Blocked";
    case "prompt":
      return "Location Ask";
    case "unsupported":
      return "Location Not Supported";
    default:
      return "Location Unknown";
  }
}

export function LocationPermissionCard() {
  const { permission, supported, checking, request, refresh } = useLocationPermission();
  const toast = useToast();
  const granted = permission === "granted";
  const blocked = permission === "denied";

  async function handleRequest() {
    const next = await request();
    if (next === "granted") {
      toast.success("Location permission allowed.");
    } else if (next === "denied") {
      toast.info("Location is blocked in browser settings.");
    } else if (next === "unsupported") {
      toast.error("Location is not supported in this browser.");
    } else {
      toast.info("Location permission is still not allowed.");
    }
  }

  async function handleRefresh() {
    const next = await refresh();
    toast.info(`Location status: ${statusLabel(next)}`);
  }

  return (
    <SettingCard
      icon={<LocateFixed />}
      title="Location Permission"
      description="Evidence photos need location attached before the driver can continue."
    >
      <div className="flex flex-col gap-3" aria-live="polite">
        <StatusRow
          label="Location Status"
          value={statusLabel(permission)}
          tone={granted ? "success" : blocked ? "danger" : "neutral"}
          icon={
            granted ? (
              <CheckCircle2 className="text-success" aria-hidden />
            ) : blocked ? (
              <MapPinOff className="text-danger" aria-hidden />
            ) : (
              <LocateFixed aria-hidden />
            )
          }
        />

        {supported && permission !== "denied" && permission !== "granted" && (
          <Button
            variant="primary"
            size="md"
            fullWidth
            loading={checking}
            iconLeft={<LocateFixed />}
            onClick={() => void handleRequest()}
          >
            Allow Location
          </Button>
        )}

        {permission === "granted" && (
          <p className="text-helper text-fg-subtle">
            This device can attach GPS location to required evidence photos automatically.
          </p>
        )}

        {permission === "denied" && (
          <Alert tone="warning" title="Location is blocked in browser settings.">
            <div className="flex flex-col gap-3">
              <p>{blockedGuidance()}</p>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                loading={checking}
                iconLeft={<RefreshCw />}
                onClick={() => void handleRefresh()}
              >
                Check again
              </Button>
            </div>
          </Alert>
        )}

        {permission === "unsupported" && (
          <Alert tone="info" title="Not available in this browser">
            Open the driver app in a browser with location support.
          </Alert>
        )}
      </div>
    </SettingCard>
  );
}
