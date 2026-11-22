import type express from "express";
import {
  AuthServiceError,
  verifySessionToken,
  type VerifiedAuthSession,
} from "../services/authService";

export const SESSION_COOKIE_NAME = "smartroutes_session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: VerifiedAuthSession;
      authToken?: string;
    }
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

export function extractRequestToken(req: express.Request): {
  token: string | null;
  source: "bearer" | "cookie" | null;
} {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice("Bearer ".length).trim();
    if (bearer) {
      return { token: bearer, source: "bearer" };
    }
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return { token: cookies[SESSION_COOKIE_NAME], source: "cookie" };
  }
  return { token: null, source: null };
}

function isHttpsRequest(req: express.Request): boolean {
  if (req.secure) return true;
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  return proto === "https";
}

export function setSessionCookie(
  req: express.Request,
  res: express.Response,
  token: string,
  maxAgeSeconds: number,
): void {
  const secure = isHttpsRequest(req) || process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (secure) {
    // SameSite=None; Secure; Partitioned supports both HTTPS Render deployments and iframe previews
    parts.push("Secure", "SameSite=None", "Partitioned");
  } else {
    parts.push("SameSite=Lax");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(req: express.Request, res: express.Response): void {
  const secure = isHttpsRequest(req) || process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (secure) {
    parts.push("Secure", "SameSite=None", "Partitioned");
  } else {
    parts.push("SameSite=Lax");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

// --- Production-Safe CORS Middleware (Never uses wildcard * on authenticated routes) ---

function getConfiguredAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  const rawList = [
    process.env.CORS_ORIGIN || "",
    process.env.FRONTEND_URL || "",
    process.env.RENDER_EXTERNAL_URL || "",
  ]
    .join(",")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);

  for (const origin of rawList) {
    if (origin !== "*") {
      allowed.add(origin);
    }
  }
  return allowed;
}

function isOriginAllowed(req: express.Request, origin: string): boolean {
  const normalized = origin.trim().replace(/\/$/, "");
  if (!normalized) return false;

  const configured = getConfiguredAllowedOrigins();
  if (configured.has(normalized)) return true;

  // Allow same-origin requests matching Host / X-Forwarded-Host
  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || String(req.headers.host || "").trim();
  if (host) {
    try {
      const parsed = new URL(normalized);
      if (parsed.host.toLowerCase() === host.toLowerCase()) {
        return true;
      }
    } catch {
      return false;
    }
  }

  // Allow local development origins when not in production
  if (process.env.NODE_ENV !== "production") {
    try {
      const parsed = new URL(normalized);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export function corsMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(req, origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,X-Requested-With",
    );
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    if (origin && !isOriginAllowed(req, origin)) {
      res.status(403).json({ error: "Origin not allowed by CORS policy." });
      return;
    }
    res.status(204).end();
    return;
  }

  next();
}

// --- CSRF Protection for Cookie-Authenticated State-Changing Requests ---

function isCsrfSafe(req: express.Request, source: "bearer" | "cookie" | null): boolean {
  if (source !== "cookie") return true;
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return true;
  }
  const requestedWith = String(req.headers["x-requested-with"] || "").trim();
  if (requestedWith === "SmartRoutes" || requestedWith === "XMLHttpRequest") {
    return true;
  }
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(req, origin)) {
    return true;
  }
  return false;
}

// --- Auth Route Middlewares ---

export async function optionalAuth(
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  const { token } = extractRequestToken(req);
  if (!token) {
    next();
    return;
  }
  try {
    req.auth = await verifySessionToken(token);
    req.authToken = token;
  } catch {
    // Ignore invalid optional tokens; protected routes use requireAuth
  }
  next();
}

export async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  const { token, source } = extractRequestToken(req);
  if (!token) {
    res.status(401).json({
      error: "Authentication required. Please sign in or continue as guest.",
      code: "AUTH_REQUIRED",
    });
    return;
  }

  if (!isCsrfSafe(req, source)) {
    res.status(403).json({
      error: "Blocked cross-site request without valid origin or header.",
      code: "CSRF_REJECTED",
    });
    return;
  }

  try {
    req.auth = await verifySessionToken(token);
    req.authToken = token;
    next();
  } catch (err) {
    if (err instanceof AuthServiceError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    res.status(401).json({ error: "Invalid authentication token.", code: "TOKEN_INVALID" });
  }
}

export function requireDriverRole(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!req.auth) {
    res.status(401).json({
      error: "Authentication required.",
      code: "AUTH_REQUIRED",
    });
    return;
  }
  if (req.auth.user.role !== "driver" || req.auth.user.isGuest) {
    res.status(403).json({
      error: "Driver account required. Guest sessions cannot access restricted Driver Mode features.",
      code: "DRIVER_ROLE_REQUIRED",
    });
    return;
  }
  next();
}
