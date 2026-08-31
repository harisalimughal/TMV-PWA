import React from "react";
import { BrandMark } from "../../ui";

export interface AppHeaderProps {
  /** Right-aligned slot — the account avatar / menu. Kept secondary. */
  account?: React.ReactNode;
}

/**
 * The home-screen top bar contents: the The Man Van lockup, and a quiet account
 * affordance pushed to the far right. Rendered inside <AppShell header={…}>, which
 * supplies the bar height, border and safe-area padding.
 */
export function AppHeader({ account }: AppHeaderProps) {
  return (
    <>
      <BrandMark size="sm" />
      {account && <div className="ml-auto flex shrink-0 items-center">{account}</div>}
    </>
  );
}
