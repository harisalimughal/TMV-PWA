import React from "react";
import { Phone } from "lucide-react";
import { cx } from "../../ui";
import { telUrl } from "../../lib/links";

export interface CustomerIdentityProps {
  customerName?: string;
  /** Renders a tap-to-call pill when present. */
  customerPhone?: string;
  className?: string;
}

/**
 * Name + tap-to-call phone, the same pairing JobHeader shows atop every workflow
 * step -- but for a context with no back arrow and no job number under the name
 * (the Home card already carries the job's booking window above this, and the job
 * number isn't something a driver picking their next job needs to see).
 */
export function CustomerIdentity({ customerName, customerPhone, className }: CustomerIdentityProps) {
  return (
    <div className={cx("flex min-w-0 items-center justify-center gap-2.5", className)}>
      <p className="min-w-0 max-w-[55%] shrink truncate text-[17px] font-bold leading-[1.15] text-fg">
        {customerName || "Unnamed customer"}
      </p>

      {customerPhone && (
        <a
          href={telUrl(customerPhone)}
          aria-label={`Call ${customerName || "the customer"} on ${customerPhone}`}
          className={cx(
            "flex shrink-0 items-center gap-2",
            "transition-transform duration-fast active:scale-95",
            "focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          )}
        >
          <span className="whitespace-nowrap font-mono text-[15px] font-semibold text-brand">
            {customerPhone}
          </span>
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-white shadow-sm [&_svg]:size-[18px]"
          >
            <Phone aria-hidden />
          </span>
        </a>
      )}
    </div>
  );
}
