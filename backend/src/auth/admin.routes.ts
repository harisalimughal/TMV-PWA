import { timingSafeEqual } from "node:crypto";
import { Request, Response, Router } from "express";
import { env } from "../config/env";
import { log } from "../utils/logger";
import { SETTINGS_SPEC } from "../admin/settings-spec";
import { listSettings, setSetting } from "../db/settings.repo";
import { listDriverProfiles, setDriverPassword, upsertDriverProfile } from "./driver-account.service";
import { clearAdminSessionCookie, setAdminSessionCookie } from "./admin-session";
import { requireAdminAuth } from "./require-admin-auth";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// Same per-IP in-memory pattern as auth.routes.ts's driver login -- there's exactly
// one admin password, so brute-forcing it is the entire threat model here.
const attemptsByIp = new Map<string, RateLimitRecord>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const record = attemptsByIp.get(ip);
  if (!record || now > record.resetAt) {
    attemptsByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  record.count++;
  return record.count > MAX_ATTEMPTS;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

export function adminRoutes(): Router {
  const router = Router();

  router.post("/login", (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (tooManyAttempts(ip)) {
      res.status(429).json({ error: { code: "TOO_MANY_ATTEMPTS", message: "Too many login attempts. Try again later." } });
      return;
    }

    if (!env.adminPassword) {
      res.status(503).json({ error: { code: "NOT_CONFIGURED", message: "Admin login is not configured." } });
      return;
    }

    const password = String(req.body?.password ?? "");
    if (!password || !safeEqual(password, env.adminPassword)) {
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Incorrect password." } });
      return;
    }

    setAdminSessionCookie(res);
    res.status(200).json({ ok: true });
  });

  router.post("/logout", (_req: Request, res: Response) => {
    clearAdminSessionCookie(res);
    res.status(200).json({ ok: true });
  });

  router.get("/me", requireAdminAuth, (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Drivers -- the roster, now Mongo-backed (see auth/driver-account.service.ts).
  // ---------------------------------------------------------------------------

  router.get("/drivers", requireAdminAuth, async (_req: Request, res: Response) => {
    const drivers = await listDriverProfiles();
    res.status(200).json({ drivers });
  });

  // Upserts on email, same as the old TMV-Chat-bot Add/Edit Driver form -- resubmitting
  // with the same email edits the existing driver. `password` is optional: leaving it
  // blank on an edit keeps whatever password (if any) is already set.
  router.post("/drivers", requireAdminAuth, async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const email = String(body.email ?? "").trim().toLowerCase();
    const initials = String(body.initials ?? "").trim().toUpperCase();
    const fullName = String(body.fullName ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const vanRegistration = String(body.vanRegistration ?? "").trim();
    const role = String(body.role ?? "").trim();
    const active = body.active !== false;
    const password = String(body.password ?? "").trim();

    if (!email || !initials || !fullName) {
      res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Email, initials and full name are required." } });
      return;
    }
    if (password && password.length < 8) {
      res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Password must be at least 8 characters." } });
      return;
    }

    try {
      await upsertDriverProfile({ email, initials, fullName, phone, vanRegistration, role, active });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        res.status(409).json({ error: { code: "DUPLICATE_INITIALS", message: "Another driver already uses these initials." } });
        return;
      }
      log.error("admin driver save failed", error);
      res.status(500).json({ error: { code: "DRIVER_SAVE_FAILED", message: "Failed to save driver." } });
      return;
    }

    if (password) {
      try {
        await setDriverPassword(email, password);
      } catch (error) {
        log.error("admin driver password set failed", error);
        res.status(200).json({ ok: true, warning: "Driver saved, but the app password could not be set. Please try again." });
        return;
      }
    }

    res.status(200).json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Settings -- key/value store replacing the old Sheets Settings tab.
  // ---------------------------------------------------------------------------

  router.get("/settings", requireAdminAuth, async (_req: Request, res: Response) => {
    const stored = await listSettings();
    const items = SETTINGS_SPEC.map(spec => ({ ...spec, value: stored[spec.key] ?? "" }));
    res.status(200).json({ settings: items });
  });

  router.post("/settings", requireAdminAuth, async (req: Request, res: Response) => {
    const key = String(req.body?.key ?? "");
    const value = String(req.body?.value ?? "");
    if (!SETTINGS_SPEC.some(spec => spec.key === key)) {
      res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Unknown setting key." } });
      return;
    }
    await setSetting(key, value);
    res.status(200).json({ ok: true });
  });

  return router;
}
