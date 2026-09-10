import React from "react";
import { cx } from "../../ui";
import type { DriverProfile } from "../../api/auth";

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

export interface MobileHeaderProps {
  driver: DriverProfile;
  className?: string;
}

/**
 * The Home greeting: a plain "Hello {name}" in bold near-black, centred, where
 * {name} is the signed-in driver's first name. The The Man Van lockup and icon
 * cluster live in the persistent <AppTopBar>; refreshing is by pull-down on the list.
 */
export function MobileHeader({ driver, className }: MobileHeaderProps) {
  return (
    <div className={cx("text-center", className)}>
      <h1 className="text-display font-bold text-fg">Hello {firstName(driver.fullName)}</h1>
    </div>
  );
}
