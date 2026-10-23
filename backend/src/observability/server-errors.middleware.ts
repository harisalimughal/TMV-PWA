import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { currentRequestId, log, recordOperationalIssue, runWithContext } from "../utils/logger";
import { areaForRequest, slowRequestThreshold, type OperationalIssue } from "./server-errors";
import { operationForEndpoint, pageFromReferer, requestEndpoint, safeRequestFilters, safeTimingName, type RequestTiming } from "./request-diagnostics";

const serverRunId = randomUUID();

export function createServerIssueTracker(options: { slowRequestMs?: number; now?: () => number } = {}): RequestHandler {
  const threshold = options.slowRequestMs ?? slowRequestThreshold();
  const now = options.now ?? (() => performance.now());
  return (req, res, next) => {
    const errorState = { logged: false };
    // Snapshot before Express routers strip their mount path. Never retain queries.
    const path = req.path.replace(/\/+$/, "");
    const excluded = !path.startsWith("/api/") || path === "/api/admin/logs" || path.startsWith("/api/admin/logs/");
    const started = now();
    let endedAt: number | undefined;
    const elapsed = () => Math.max(0, Math.round((endedAt ?? now()) - started));
    const requestStartedAt = new Date().toISOString();
    const page = pageFromReferer(req.get?.("referer"), !path.startsWith("/api/admin/"));
    const timings = new Map<string, RequestTiming>();
    let endpoint = requestEndpoint(path, req);
    let jobId: string | undefined;
    let finished = false;
    let invalidLink = false;
    const requestDetails = () => {
      if (req.baseUrl && typeof req.route?.path === "string") endpoint = requestEndpoint(path, req) ?? endpoint;
      if (typeof req.params?.jobId === "string" && /^TMV-[A-Z0-9_-]{1,40}$/.test(req.params.jobId)) jobId = req.params.jobId;
      return { method: req.method, endpoint, operation: endpoint ? operationForEndpoint(endpoint, req.method) : undefined,
        page, requestStartedAt, buildId: process.env.APP_BUILD_ID ?? "local", serverRunId, job_id: jobId, filters: safeRequestFilters(req.query),
        durationMs: elapsed(),
        timings: [...timings.values()].sort((a, b) => b.durationMs - a.durationMs).slice(0, 12).map(row => ({ ...row })) };
    };
    const beginTiming = (name: string) => {
      if (excluded || finished || !safeTimingName(name) || (!timings.has(name) && timings.size >= 20)) return;
      const row = timings.get(name) ?? { name, durationMs: 0, maxMs: 0, calls: 0, failed: 0, pending: 0 };
      timings.set(name, row); row.calls++; row.pending++;
      const start = now();
      return (failed: boolean) => {
        const ms = Math.max(0, now() - start);
        row.pending--; row.durationMs += ms; row.maxMs = Math.max(row.maxMs, ms); if (failed) row.failed++;
      };
    };
    runWithContext({ errorState, requestDetails, beginTiming }, () => {
      const requestId = currentRequestId();
      if (path.startsWith("/api/")) res.setHeader?.("X-Request-ID", requestId);
      if (!excluded) {
        // Read only two fixed response codes; never copy bodies, credentials or tokens.
        const json = res.json.bind(res);
        res.json = body => {
          endpoint = requestEndpoint(path, req) ?? endpoint;
          const code = body?.error?.code;
          if (code === "INVALID_SETUP_LINK" || code === "INVALID_RESET_LINK") invalidLink = true;
          return json(body);
        };
        const expectedStream = () => String(res.getHeader("content-type") ?? "").toLowerCase().startsWith("text/event-stream");
        const fields = () => ({ area: areaForRequest(path), durationMs: elapsed(), audience: path.startsWith("/api/admin/") ? "Admin" : path.startsWith("/api/auth/") || path.startsWith("/api/jobs") || path.startsWith("/api/van") || path.startsWith("/api/storage") ? "Driver" : undefined });
        const context = { requestId, errorState, requestDetails, beginTiming };
        const record = (issue: OperationalIssue, httpStatus?: number) => runWithContext(context, () => recordOperationalIssue(issue, { ...fields(), httpStatus }));
        res.once("finish", () => {
          endedAt = now();
          finished = true;
          const status = res.statusCode;
          if (status >= 500) {
            if (!errorState.logged) runWithContext(context, () => log.error("Server request failed", undefined, { ...fields(), httpStatus: status, ...(status === 504 ? { issueType: "request_timeout" } : {}) }));
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
          endedAt ??= now();
          if (!finished && !res.writableFinished && !errorState.logged && !(res.statusCode < 400 && expectedStream())) record("connection_closed");
          finished = true;
        });
      }
      next();
    });
  };
}

export const trackServerErrors = createServerIssueTracker();
