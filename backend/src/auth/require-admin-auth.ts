import { NextFunction, Request, Response } from "express";
import {
  readAdminSessionCookie, setAdminSessionCookie, shouldRefresh, verifyAdminSessionToken
} from "./admin-session";

/**
 * Gate for every /api/admin/* route except /login itself. Signature + expiry only --
 * there's no admin DB row to re-check on each request (see admin-session.ts's note on
 * why the admin password is baked into the signing key instead).
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const payload = verifyAdminSessionToken(readAdminSessionCookie(req));
  if (!payload) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please log in." } });
    return;
  }

  // Sliding expiry, same pattern as requireDriverAuth.
  if (shouldRefresh(payload)) {
    setAdminSessionCookie(res);
  }

  next();
}
