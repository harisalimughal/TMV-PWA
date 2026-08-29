import { Request, Response, Router } from "express";
import { env } from "../config/env";
import { sendPasswordResetEmail } from "../google/gmail";
import { log } from "../utils/logger";
import { getDriverAccount, getDriverProfile, setDriverPassword, verifyDriverPassword } from "./driver-account.service";
import { requireDriverAuth } from "./require-driver-auth";
import { clearSessionCookie, setSessionCookie } from "./session";
import { verifySetupToken } from "./setup-token";
import { issueResetToken, verifyResetToken } from "./reset-token";

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

    const profile = await getDriverProfile(result.account.email);
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

    // The Mongo driver_accounts doc is the actual source of truth for "is this a real
    // driver" -- a valid signature only proves the link came from the admin dashboard,
    // not that the driver record still exists/is active.
    const profile = await getDriverProfile(verified.email);
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

  // Always responds 200 with the same generic message whether or not the email has an
  // account -- confirming/denying account existence here would let anyone enumerate
  // registered driver emails.
  router.post("/forgot-password", async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (tooManyAttempts(ip)) {
      res.status(429).json({ error: { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Try again later." } });
      return;
    }

    const email = String(req.body?.email ?? "").trim();
    const generic = { ok: true, message: "If that email has a driver account, we've sent a password reset link." };
    if (!email) {
      res.status(200).json(generic);
      return;
    }

    try {
      const account = await getDriverAccount(email);
      if (account && account.active) {
        const token = issueResetToken(account.email, account.tokenVersion);
        const resetUrl = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
        await sendPasswordResetEmail(account.email, resetUrl);
      }
    } catch (error) {
      // Logged, not surfaced -- the response must stay generic either way.
      log.warn("forgot-password request failed", { error: String(error) });
    }

    res.status(200).json(generic);
  });

  router.post("/reset-password", async (req: Request, res: Response) => {
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

    const verified = verifyResetToken(token);
    if (!verified.ok) {
      log.warn("password reset link verification failed", { reason: verified.reason });
      const message =
        verified.reason === "expired"
          ? "This reset link has expired. Request a new one."
          : "This reset link is invalid. Request a new one.";
      res.status(400).json({ error: { code: "INVALID_RESET_LINK", message } });
      return;
    }

    const account = await getDriverAccount(verified.email);
    if (!account || !account.active) {
      res.status(400).json({ error: { code: "DRIVER_NOT_FOUND", message: "This driver account could not be found or is inactive." } });
      return;
    }
    // The account's tokenVersion has moved on since this link was issued (a password
    // change, or another reset already completed) -- the link is stale even though it
    // hasn't technically expired yet.
    if (account.tokenVersion !== verified.tokenVersion) {
      res.status(400).json({ error: { code: "INVALID_RESET_LINK", message: "This reset link has already been used. Request a new one." } });
      return;
    }

    await setDriverPassword(verified.email, password);
    const profile = await getDriverProfile(verified.email);
    const updated = await getDriverAccount(verified.email);
    setSessionCookie(res, verified.email, updated!.tokenVersion);

    res.status(200).json({
      ok: true,
      driver: profile
        ? { email: verified.email, fullName: profile.fullName, initials: profile.initials }
        : { email: verified.email, fullName: verified.email, initials: "" }
    });
  });

  router.post("/logout", (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
  });

  router.get("/me", requireDriverAuth, async (req: Request, res: Response) => {
    const profile = await getDriverProfile(req.driverEmail!);
    res.status(200).json({
      driver: profile
        ? { email: req.driverEmail, fullName: profile.fullName, initials: profile.initials }
        : { email: req.driverEmail, fullName: req.driverEmail, initials: "" }
    });
  });

  return router;
}
