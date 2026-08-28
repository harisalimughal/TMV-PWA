import { Request, Response, Router } from "express";
import { getDriver } from "../google/sheets";
import { log } from "../utils/logger";
import { getDriverAccount, setDriverPassword, verifyDriverPassword } from "./driver-account.service";
import { requireDriverAuth } from "./require-driver-auth";
import { clearSessionCookie, setSessionCookie } from "./session";
import { verifySetupToken } from "./setup-token";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// Login attempts specifically, not general API traffic -- this is the one endpoint
// where brute-forcing a password is the actual threat model. Per-IP, in-memory: fine
// for this app's scale (a handful of drivers), same pattern as the admin dashboard's
// rate limiter (dashboard/server/auth.ts in TMV-Chat-bot).
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

export function authRoutes(): Router {
  const router = Router();

  router.post("/login", async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (tooManyAttempts(ip)) {
      res.status(429).json({ error: { code: "TOO_MANY_ATTEMPTS", message: "Too many login attempts. Try again later." } });
      return;
    }

    const email = String(req.body?.email ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!email || !password) {
      res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Email and password are required." } });
      return;
    }

    const result = await verifyDriverPassword(email, password);
    if (!result.ok || !result.account) {
      log.warn("driver login failed", { email, reason: result.reason });
      // Same message regardless of reason -- doesn't tell an attacker whether the
      // account exists at all.
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } });
      return;
    }

    const profile = await getDriver(result.account.email);
    setSessionCookie(res, result.account.email, result.account.tokenVersion);
    res.status(200).json({
      ok: true,
      driver: profile
        ? { email: result.account.email, fullName: profile.fullName, initials: profile.initials }
        : { email: result.account.email, fullName: result.account.email, initials: "" }
    });
  });

  // Completes a password-setup link sent from the admin dashboard. Public (no auth
  // required to call it -- the signed token IS the credential), but rate-limited the
  // same as login since it also ends in a live session being issued.
  router.post("/complete-setup", async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (tooManyAttempts(ip)) {
      res.status(429).json({ error: { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Try again later." } });
      return;
    }

    const token = String(req.body?.token ?? "");
    const password = String(req.body?.password ?? "");
    if (password.length < 8) {
      res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Password must be at least 8 characters." } });
      return;
    }

    const verified = verifySetupToken(token);
    if (!verified.ok) {
      log.warn("driver setup-link verification failed", { reason: verified.reason });
      const message =
        verified.reason === "expired"
          ? "This setup link has expired. Ask your manager to send a new one."
          : "This setup link is invalid. Ask your manager to send a new one.";
      res.status(400).json({ error: { code: "INVALID_SETUP_LINK", message } });
      return;
    }

    // The Sheets row is the actual source of truth for "is this a real driver" --
    // a valid signature only proves the link came from the admin dashboard, not that
    // the driver row still exists/is active.
    const profile = await getDriver(verified.email);
    if (!profile || !profile.active) {
      res.status(400).json({ error: { code: "DRIVER_NOT_FOUND", message: "This driver account could not be found or is inactive." } });
      return;
    }

    await setDriverPassword(verified.email, password);
    const account = await getDriverAccount(verified.email);
    setSessionCookie(res, verified.email, account!.tokenVersion);

    res.status(200).json({
      ok: true,
      driver: { email: verified.email, fullName: profile.fullName, initials: profile.initials }
    });
  });

  router.post("/logout", (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
  });

  router.get("/me", requireDriverAuth, async (req: Request, res: Response) => {
    const profile = await getDriver(req.driverEmail!);
    res.status(200).json({
      driver: profile
        ? { email: req.driverEmail, fullName: profile.fullName, initials: profile.initials }
        : { email: req.driverEmail, fullName: req.driverEmail, initials: "" }
    });
  });

  return router;
}
