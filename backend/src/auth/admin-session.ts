import { createHmac, timingSafeEqual } from "node:crypto";
import { Request, Response } from "express";
import { env } from "../config/env";

const COOKIE_NAME = "tmv_admin_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_IF_UNDER_MS = SESSION_TTL_MS / 2;
const PURPOSE = "admin_session";

interface AdminSessionPayload {
  purpose: typeof PURPOSE;
  exp: number;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

/**
 * Keyed on the admin password itself, not just the general signing secret -- there's
 * no per-admin DB row to bump a tokenVersion on (unlike driver sessions), so rotating
 * TMV_ADMIN_PASSWORD is the only way to invalidate outstanding admin sessions. Mixing
 * it into the signing key makes that happen automatically.
 */
function signingKey(): string {
  return createHmac("sha256", env.signatureLinkSecret).update(env.adminPassword).digest("hex");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", signingKey()).update(payloadB64).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function issueAdminSessionToken(): string {
  const payload: AdminSessionPayload = { purpose: PURPOSE, exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

function verifyAdminSessionToken(token: string | undefined): AdminSessionPayload | null {
  if (!token || !env.adminPassword) return null;
  const dot = token.indexOf(".");
  if (dot === -1) return null;

  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payloadB64))) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as AdminSessionPayload;
    if (payload.purpose !== PURPOSE) return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function shouldRefresh(payload: AdminSessionPayload): boolean {
  return payload.exp - Date.now() < REFRESH_IF_UNDER_MS;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.nodeEnv === "production",
    path: "/",
    maxAge: SESSION_TTL_MS
  };
}

export function setAdminSessionCookie(res: Response): void {
  res.cookie(COOKIE_NAME, issueAdminSessionToken(), cookieOptions());
}

export function clearAdminSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: env.nodeEnv === "production", path: "/" });
}

export function readAdminSessionCookie(req: Request): string | undefined {
  return req.cookies?.[COOKIE_NAME];
}

export { verifyAdminSessionToken };
