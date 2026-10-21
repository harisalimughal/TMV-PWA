import type { RequestHandler } from "express";
import { currentRequestId, log, recordOperationalIssue, runWithContext } from "../utils/logger";
import { areaForRequest, slowRequestThreshold, type OperationalIssue } from "./server-errors";

export function createServerIssueTracker(options: { slowRequestMs?: number; now?: () => number } = {}): RequestHandler {
  const threshold = options.slowRequestMs ?? slowRequestThreshold();
  const now = options.now ?? (() => performance.now());
  return (req, res, next) => {
    const errorState = { logged: false };
    // Snapshot before Express routers strip their mount path. Never retain queries.
    const path = req.path.replace(/\/+$/, "");
    const excluded = !path.startsWith("/api/") || path === "/api/admin/logs" || path.startsWith("/api/admin/logs/");
    const started = now();
    let finished = false;
    let invalidLink = false;
    runWithContext({ errorState }, () => {
      const requestId = currentRequestId();
      if (!excluded) {
        // Read only two fixed response codes; never copy bodies, credentials or tokens.
        const json = res.json.bind(res);
        res.json = body => {
          const code = body?.error?.code;
          if (code === "INVALID_SETUP_LINK" || code === "INVALID_RESET_LINK") invalidLink = true;
          return json(body);
        };
        const elapsed = () => Math.max(0, Math.round(now() - started));
        const expectedStream = () => String(res.getHeader("content-type") ?? "").toLowerCase().startsWith("text/event-stream");
        const fields = () => ({ area: areaForRequest(path), durationMs: elapsed(), audience: path.startsWith("/api/admin/") ? "Admin" : path.startsWith("/api/auth/") || path.startsWith("/api/jobs") || path.startsWith("/api/van") || path.startsWith("/api/storage") ? "Driver" : undefined });
        const record = (issue: OperationalIssue, httpStatus?: number) => runWithContext({ requestId, errorState }, () => recordOperationalIssue(issue, { ...fields(), httpStatus }));
        res.once("finish", () => {
          finished = true;
          const status = res.statusCode;
          if (status >= 500) {
            if (!errorState.logged) runWithContext({ requestId, errorState }, () => log.error("Server request failed", undefined, { ...fields(), httpStatus: status, ...(status === 504 ? { issueType: "request_timeout" } : {}) }));
            return;
          }
          const login = req.method === "POST" && (path === "/api/admin/login" || path === "/api/auth/login");
          const sessionPresent = Boolean(path.startsWith("/api/admin/") ? req.cookies?.tmv_admin_session : req.cookies?.tmv_driver_session);
          // A signed-out app's normal session probe is not a failed sign-in.
          const normalSignedOutProbe = !sessionPresent && req.method === "GET" && (path === "/api/admin/me" || path === "/api/auth/me");
          if (login && status === 401) record("login_failed", status);
          else if (login && status === 400) record("login_incomplete", status);
          else if (invalidLink && status === 400) record("invalid_link", status);
          else if (status === 401 && !normalSignedOutProbe) record(sessionPresent ? "session_invalid" : "sign_in_required", status);
          else if (status === 403) record("permission_denied", status);
          else if (status === 429) record("rate_limited", status);
          else if (status === 408) record("request_timeout", status);
          else if (status === 404) record("not_found", status);
          else if (status === 409) record("conflict", status);
          else if (status === 413) record("too_large", status);
          else if (status >= 200 && status < 400 && !expectedStream() && elapsed() >= threshold) record("slow_request", status);
        });
        res.once("close", () => {
          if (!finished && !res.writableFinished && !errorState.logged && !(res.statusCode < 400 && expectedStream())) record("connection_closed");
        });
      }
      next();
    });
  };
}

export const trackServerErrors = createServerIssueTracker();
