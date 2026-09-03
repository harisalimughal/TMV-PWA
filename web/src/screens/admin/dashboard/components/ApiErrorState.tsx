import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { SERVER_ERROR_MESSAGE } from "../../../../lib/apiErrors";

interface Props {
  /** Defaults to a calm "our end, not yours" message. api.ts's apiFetch already
   *  collapses a 5xx or network-level failure to exactly that message, so most
   *  callers can just pass the caught error's `.message` straight through -- a 4xx's
   *  specific reason (e.g. "Email already exists") still comes through unchanged. */
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Standard inline failure state for an admin page's primary data fetch.
 *
 * Before this, a failed query on most pages rendered nothing different from "there's
 * just no data" -- the table/list simply stayed empty, with the only evidence
 * anything was wrong sitting in the browser console. That's exactly how a live
 * MongoDB Atlas connectivity outage (Sept 2026) went unnoticed at a glance: every
 * page just looked quiet instead of broken.
 */
export function ApiErrorState({ message, onRetry, className = "" }: Props) {
  return (
    <div
      className={`flex flex-col items-center gap-3 p-10 text-center bg-white rounded-module border border-admin-line shadow-sm ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-admin-status-red-bg text-admin-status-red flex items-center justify-center shrink-0">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <p className="text-[14px] font-semibold text-admin-ink max-w-md">{message || SERVER_ERROR_MESSAGE}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 h-9 px-4 rounded-control bg-admin-surface hover:bg-white border border-admin-line text-admin-ink text-[13px] font-semibold transition flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      )}
    </div>
  );
}
