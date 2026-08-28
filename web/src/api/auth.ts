export interface DriverProfile {
  email: string;
  fullName: string;
  initials: string;
}

export interface ApiError {
  code: string;
  message: string;
}

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Resolves to the driver profile, or null if there's no live session -- never throws
 * on a plain 401, since "not logged in" is an expected outcome on first load, not an
 * error. Throws only on a genuinely unexpected failure (network down, 5xx). */
export async function fetchSession(): Promise<DriverProfile | null> {
  const res = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Could not check login status.");
  const body = await parseJson(res);
  return body?.driver ?? null;
}

export async function login(email: string, password: string): Promise<DriverProfile> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const error: ApiError = body?.error ?? { code: "UNKNOWN", message: "Something went wrong. Try again." };
    throw error;
  }
  return body.driver as DriverProfile;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
}

/** Always resolves (never throws for "not found") -- the backend deliberately returns
 * the same generic response either way, so this can't be used to enumerate accounts. */
export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await fetch("/api/auth/forgot-password", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const error: ApiError = body?.error ?? { code: "UNKNOWN", message: "Something went wrong. Try again." };
    throw error;
  }
  return body;
}

export async function resetPassword(token: string, password: string): Promise<DriverProfile> {
  const res = await fetch("/api/auth/reset-password", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password })
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const error: ApiError = body?.error ?? { code: "UNKNOWN", message: "Something went wrong. Try again." };
    throw error;
  }
  return body.driver as DriverProfile;
}
