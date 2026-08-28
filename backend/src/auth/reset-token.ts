import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";

// Unlike setup-token.ts's DRIVER_SETUP_LINK_SECRET, this never leaves this project --
// a forgot-password request and the reset link it emails are both entirely within
// tmv-pwa, so it's signed with this project's own session secret rather than the one
// shared with TMV-Chat-bot.
const RESET_TOKEN_PURPOSE = "password_reset";
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes -- short-lived, emailed link

interface ResetTokenPayload {
  email: string;
  purpose: typeof RESET_TOKEN_PURPOSE;
  /** The tokenVersion the account had when the link was issued. If the password
   * changes (or another reset completes) before this link is used, tokenVersion moves
   * on and the token is rejected -- reusing an old email is not enough to reset again. */
  tokenVersion: number;
  exp: number;
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", env.signatureLinkSecret).update(payloadB64).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function issueResetToken(email: string, tokenVersion: number): string {
  if (!env.signatureLinkSecret) throw new Error("TMV_SIGNATURE_LINK_SECRET is not configured.");
  const payload: ResetTokenPayload = { email, purpose: RESET_TOKEN_PURPOSE, tokenVersion, exp: Date.now() + TOKEN_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export type VerifyResetTokenResult =
  | { ok: true; email: string; tokenVersion: number }
  | { ok: false; reason: "not_configured" | "malformed" | "bad_signature" | "expired" | "wrong_purpose" };

export function verifyResetToken(token: string | undefined): VerifyResetTokenResult {
  if (!env.signatureLinkSecret) return { ok: false, reason: "not_configured" };
  if (!token) return { ok: false, reason: "malformed" };

  const dot = token.indexOf(".");
  if (dot === -1) return { ok: false, reason: "malformed" };

  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payloadB64))) return { ok: false, reason: "bad_signature" };

  let payload: ResetTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (payload.purpose !== RESET_TOKEN_PURPOSE) return { ok: false, reason: "wrong_purpose" };
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) return { ok: false, reason: "expired" };
  if (typeof payload.email !== "string" || !payload.email) return { ok: false, reason: "malformed" };

  return { ok: true, email: payload.email, tokenVersion: payload.tokenVersion };
}
