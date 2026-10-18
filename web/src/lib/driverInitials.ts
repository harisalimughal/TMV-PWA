import type { DriverProfile } from "../api/auth";

/** Two-letter badge for the signed-in driver: the profile's own initials when set,
 *  else first + last name initials, else "?". */
export function driverInitials(driver: Pick<DriverProfile, "initials" | "fullName">): string {
  if (driver.initials) return driver.initials.slice(0, 2).toUpperCase();
  const parts = (driver.fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
