export type AuthRole = "driver" | "guest";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
  role: AuthRole;
  isGuest: boolean;
  driverModeActive: boolean;
  createdAt: number;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: AuthUser | null;
  token?: string | null;
  expiresIn?: number;
  driverModeActive?: boolean;
  error?: string;
  code?: string;
}

export interface DriverStatusResponse {
  role: AuthRole;
  driverModeActive: boolean;
  user: AuthUser;
  capabilities: {
    driverMode: boolean;
    liveGpsTelemetry: boolean;
    saveJourneys: boolean;
    submitCommunityReports: boolean;
    managePreferences: boolean;
  };
  checkedAt: number;
}

// Held strictly in JS memory (never written to localStorage or sessionStorage)
let inMemoryAccessToken: string | null = null;
const authExpiredListeners = new Set<() => void>();

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token && token.trim() ? token.trim() : null;
}

export function onAuthExpired(listener: () => void): () => void {
  authExpiredListeners.add(listener);
  return () => {
    authExpiredListeners.delete(listener);
  };
}

export function notifyAuthExpired(): void {
  inMemoryAccessToken = null;
  for (const listener of authExpiredListeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

export function resolveApiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (!base) return path;
  const normalizedBase = base.replace(/\/$/, "");
  return path.startsWith("/") ? `${normalizedBase}${path}` : `${normalizedBase}/${path}`;
}

export async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set("X-Requested-With", "SmartRoutes");
  if (inMemoryAccessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${inMemoryAccessToken}`);
  }
  return fetch(resolveApiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });
}

async function parseAuthJson<T>(res: Response, fallbackError: string): Promise<T> {
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${fallbackError} (HTTP ${res.status})`);
  }
  if (!res.ok) {
    if (
      res.status === 401 &&
      (data?.code === "TOKEN_EXPIRED" || data?.code === "TOKEN_REVOKED")
    ) {
      notifyAuthExpired();
    }
    throw new Error(data?.error || `${fallbackError} (HTTP ${res.status})`);
  }
  return data as T;
}

export async function apiAuthMe(): Promise<AuthSessionResponse> {
  const res = await authFetch("/api/auth/me", { method: "GET" });
  const text = await res.text();
  let data: AuthSessionResponse = { authenticated: false, user: null };
  try {
    data = text ? (JSON.parse(text) as AuthSessionResponse) : data;
  } catch {
    return { authenticated: false, user: null };
  }
  if (!res.ok || !data.authenticated || !data.user) {
    setAccessToken(null);
    return { authenticated: false, user: null, code: data.code, error: data.error };
  }
  setAccessToken(data.token ?? null);
  return data;
}

export async function apiAuthLogin(
  email: string,
  password: string,
): Promise<AuthSessionResponse> {
  const res = await authFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseAuthJson<AuthSessionResponse>(res, "Sign in failed");
  setAccessToken(data.token ?? null);
  return data;
}

export async function apiAuthRegister(
  email: string,
  password: string,
  name?: string,
): Promise<AuthSessionResponse> {
  const res = await authFetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  const data = await parseAuthJson<AuthSessionResponse>(res, "Sign up failed");
  setAccessToken(data.token ?? null);
  return data;
}

export async function apiAuthGuest(): Promise<AuthSessionResponse> {
  const res = await authFetch("/api/auth/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await parseAuthJson<AuthSessionResponse>(res, "Guest access failed");
  setAccessToken(data.token ?? null);
  return data;
}

export async function apiAuthLogout(): Promise<void> {
  try {
    await authFetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } finally {
    setAccessToken(null);
  }
}

export async function apiSetDriverMode(active: boolean): Promise<AuthSessionResponse> {
  const res = await authFetch("/api/auth/driver-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  const data = await parseAuthJson<AuthSessionResponse>(
    res,
    "Could not update Driver Mode",
  );
  if (data.token) {
    setAccessToken(data.token);
  }
  return data;
}

export async function apiGetDriverStatus(): Promise<DriverStatusResponse> {
  const res = await authFetch("/api/driver/status", { method: "GET" });
  return parseAuthJson<DriverStatusResponse>(res, "Driver status unavailable");
}
