import { request, postJson, type ApiError } from "../lib/http";

export type { ApiError };

export interface DriverProfile {
  email: string;
  fullName: string;
  initials: string;
}

/**
 * Resolves to the driver profile, or null if there's no live session. A 401 here is an
 * expected outcome on first load rather than an expired session, so allowUnauthorized
 * keeps it from firing the global "you've been signed out" handler.
 */
export async function fetchSession(): Promise<DriverProfile | null> {
  try {
    const body = await request<{ driver?: DriverProfile }>("/api/auth/me", { allowUnauthorized: true });
    return body?.driver ?? null;
  } catch (err) {
    if ((err as ApiError)?.status === 401) return null;
    throw err;
  }
}

export async function login(email: string, password: string): Promise<DriverProfile> {
  const body = await postJson<{ driver: DriverProfile }>(
    "/api/auth/login",
    { email, password },
    { allowUnauthorized: true } // a wrong password is a form error, not a dead session
  );
  return body.driver;
}

export async function logout(): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST", allowUnauthorized: true, timeoutMs: 5000 });
  } catch {
    // Signing out locally must always succeed, even with no connection.
  }
}

/** Always resolves the same way whether or not the account exists -- the backend
 *  deliberately returns a generic response so this can't enumerate accounts. */
export function forgotPassword(email: string): Promise<{ message: string }> {
  return postJson<{ message: string }>("/api/auth/forgot-password", { email }, { allowUnauthorized: true });
}

export async function resetPassword(token: string, password: string): Promise<DriverProfile> {
  const body = await postJson<{ driver: DriverProfile }>(
    "/api/auth/reset-password",
    { token, password },
    { allowUnauthorized: true }
  );
  return body.driver;
}
