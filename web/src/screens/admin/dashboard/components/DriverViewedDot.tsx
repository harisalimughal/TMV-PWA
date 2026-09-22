import React from "react";

export function DriverViewedDot({ viewedAt }: { viewedAt?: string }) {
  if (!viewedAt) return null;

  return (
    <span
      aria-label="Driver Viewed the Job"
      title="Driver Viewed the Job"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-admin-status-green ring-2 ring-admin-status-green/20"
    />
  );
}
