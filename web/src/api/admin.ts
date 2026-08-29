export interface ApiError {
  code: string;
  message: string;
}

export interface AdminDriver {
  email: string;
  initials: string;
  fullName: string;
  phone: string;
  vanRegistration: string;
  role: string;
  active: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
}

export interface DriverInput {
  email: string;
  initials: string;
  fullName: string;
  phone: string;
  vanRegistration: string;
  role: string;
  active: boolean;
  /** Blank on an edit keeps the existing password (if any) unchanged. */
  password?: string;
}

export interface AdminSetting {
  key: string;
  label: string;
  type: "text" | "textarea" | "number";
  fallback: string;
  hint?: string;
  value: string;
}

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const error: ApiError = body?.error ?? { code: "UNKNOWN", message: "Something went wrong. Try again." };
    throw error;
  }
  return body as T;
}

/** Resolves to whether there's a live admin session -- never throws on a plain 401. */
export async function fetchAdminSession(): Promise<boolean> {
  const res = await fetch("/api/admin/me", { credentials: "same-origin" });
  return res.ok;
}

export async function adminLogin(password: string): Promise<void> {
  await request("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) });
}

export async function adminLogout(): Promise<void> {
  await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
}

export async function fetchDrivers(): Promise<AdminDriver[]> {
  const body = await request<{ drivers: AdminDriver[] }>("/api/admin/drivers");
  return body.drivers;
}

export async function saveDriver(input: DriverInput): Promise<{ ok: true; warning?: string }> {
  return request("/api/admin/drivers", { method: "POST", body: JSON.stringify(input) });
}

export async function fetchSettings(): Promise<AdminSetting[]> {
  const body = await request<{ settings: AdminSetting[] }>("/api/admin/settings");
  return body.settings;
}

export async function saveSetting(key: string, value: string): Promise<void> {
  await request("/api/admin/settings", { method: "POST", body: JSON.stringify({ key, value }) });
}
