import { NextFunction, Request, Response } from "express";
import { getDriverAccount } from "./driver-account.service";
import { readSessionCookie, setSessionCookie, shouldRefresh, verifySessionToken } from "./session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      driverEmail?: string;
    }
  }
}

/**
 * Verifies the session cookie against the database, not just its own signature --
 * catches a password change or account deactivation immediately (tokenVersion/active
 * are re-checked on every request), rather than only once the old cookie's fixed
 * expiry finally runs out.
 */
export async function requireDriverAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const payload = verifySessionToken(readSessionCookie(req));
  if (!payload) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please log in." } });
    return;
  }

  const account = await getDriverAccount(payload.email);
  if (!account || !account.active || account.tokenVersion !== payload.tokenVersion) {
    res.status(401).json({ error: { code: "SESSION_REVOKED", message: "Your session is no longer valid. Please log in again." } });
    return;
  }

  req.driverEmail = payload.email;

  // Sliding expiry: an actively-used device's session keeps renewing itself and never
  // hits the fixed 180-day ceiling; only a genuinely dormant device does.
  if (shouldRefresh(payload)) {
    setSessionCookie(res, payload.email, payload.tokenVersion);
  }

  next();
}
