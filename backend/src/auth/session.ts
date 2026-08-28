import { createHmac, timingSafeEqual } from "node:crypto";
import { Request, Response } from "express";
import { env } from "../config/env";

const COOKIE_NAME = "tmv_driver_session";

// "Permanent" login per the spec, in practice: a long sliding window. Each authenticated
// request that's past the halfway point re-issues the cookie with a fresh expiry (see
// requireDriverAuth), so an actively-used device never gets logged out; a device that
// goes untouched for 6 months does.
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const REFRESH_IF_UNDER_MS = SESSION_TTL_MS / 2;

export interface SessionPayload {
  email: string;
  tokenVersion: number;
  exp: number;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payloadB64: string): string {
  // No fallback secret: assertRuntimeConfig() (server.ts) requires
  // TMV_SIGNATURE_LINK_SECRET to be set before the server accepts traffic. A hardcoded
  // fallback here would let anyone who can read this open-source-style code forge a
  // valid session for any driver.
  return createHmac("sha256", env.signatureLinkSecret).update(payloadB64).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function issueSessionToken(email: string, tokenVersion: number): string {
  const payload: SessionPayload = { email, tokenVersion, exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Returns the decoded payload if the token's signature and expiry are valid.
 * Does NOT check tokenVersion against the database -- callers that need "was this
 * session revoked by a password change" must compare exp/tokenVersion against a fresh
 * DriverAccountDoc lookup themselves (see requireDriverAuth). */
export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot === -1) return null;

  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payloadB64))) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as SessionPayload;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    if (typeof payload.email !== "string" || typeof payload.tokenVersion !== "number") return null;
    return payload;
  } catch {
    return null;
  }
}

export function shouldRefresh(payload: SessionPayload): boolean {
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

export function setSessionCookie(res: Response, email: string, tokenVersion: number): void {
  res.cookie(COOKIE_NAME, issueSessionToken(email, tokenVersion), cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: env.nodeEnv === "production", path: "/" });
}

export function readSessionCookie(req: Request): string | undefined {
  return req.cookies?.[COOKIE_NAME];
}
