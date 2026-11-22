import crypto from "crypto";
import fs from "fs";
import path from "path";
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

export type AuthRole = "driver" | "guest";

export interface AuthUserPublic {
  id: string;
  email: string | null;
  name: string;
  role: AuthRole;
  isGuest: boolean;
  driverModeActive: boolean;
  createdAt: number;
}

interface StoredDriverAccount {
  id: string;
  email: string;
  name: string;
  role: "driver";
  passwordHash: string;
  driverModeActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VerifiedAuthSession {
  user: AuthUserPublic;
  jti: string;
  exp: number;
  iat: number;
}

export type TokenErrorCode =
  | "AUTH_REQUIRED"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "TOKEN_INVALID"
  | "JWT_CONFIG_ERROR";

export class AuthServiceError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "AuthServiceError";
    this.status = status;
    this.code = code;
  }
}

const JWT_ISSUER = "smartroutes-api";
const JWT_AUDIENCE = "smartroutes-client";
const DRIVER_TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const GUEST_TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const MIN_SECRET_LENGTH = 32;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Ephemeral dev-only secret if JWT_SECRET is not provided in non-production environments.
// Production strictly refuses to sign/verify without process.env.JWT_SECRET.
let ephemeralDevSecret: string | null = null;
let loggedDevWarning = false;

function getJwtSecretBytes(): Uint8Array {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) {
    if (configured.length < MIN_SECRET_LENGTH) {
      throw new AuthServiceError(
        "Server authentication configuration is invalid (JWT_SECRET must be at least 32 characters).",
        503,
        "JWT_CONFIG_ERROR",
      );
    }
    return new TextEncoder().encode(configured);
  }

  if (process.env.NODE_ENV === "production") {
    throw new AuthServiceError(
      "Server authentication is not configured: JWT_SECRET environment variable is required in production.",
      503,
      "JWT_CONFIG_ERROR",
    );
  }

  if (!ephemeralDevSecret) {
    ephemeralDevSecret = crypto.randomBytes(64).toString("hex");
    if (!loggedDevWarning) {
      loggedDevWarning = true;
      console.warn(
        "[SmartRoutes Auth] JWT_SECRET is not set in development environment; using ephemeral in-memory random key for this process.",
      );
    }
  }
  return new TextEncoder().encode(ephemeralDevSecret);
}

export function isJwtSecretConfigured(): boolean {
  const configured = process.env.JWT_SECRET?.trim();
  return Boolean(configured && configured.length >= MIN_SECRET_LENGTH);
}

// --- Password Hashing (scrypt + per-user random salt + constant-time compare) ---

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const expectedBuf = Buffer.from(expectedHex, "hex");
  const actualBuf = crypto.scryptSync(password, salt, 64);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// --- File-Backed Driver Account Store (atomic write, 0600 permissions) ---

function resolveStorePath(): string {
  const custom = process.env.AUTH_STORE_PATH?.trim();
  if (custom) {
    return path.resolve(custom);
  }
  return path.resolve(process.cwd(), ".data", "auth-users.json");
}

const accountsById = new Map<string, StoredDriverAccount>();
const accountIdByEmail = new Map<string, string>();
let storeLoaded = false;

function ensureStoreLoaded(): void {
  if (storeLoaded) return;
  storeLoaded = true;
  const filePath = resolveStorePath();
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as { accounts?: StoredDriverAccount[] };
    if (Array.isArray(parsed.accounts)) {
      for (const acc of parsed.accounts) {
        if (acc?.id && acc?.email && acc?.passwordHash) {
          accountsById.set(acc.id, acc);
          accountIdByEmail.set(acc.email.toLowerCase(), acc.id);
        }
      }
    }
  } catch (err) {
    console.warn("[SmartRoutes Auth] Could not read persisted auth store; starting fresh.", err);
  }
}

function persistStore(): void {
  const filePath = resolveStorePath();
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const payload = JSON.stringify(
      { accounts: Array.from(accountsById.values()) },
      null,
      2,
    );
    const tmpPath = `${filePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    fs.writeFileSync(tmpPath, payload, { mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.warn("[SmartRoutes Auth] Failed to persist auth store to disk:", err);
  }
}

function toPublicUser(acc: StoredDriverAccount): AuthUserPublic {
  return {
    id: acc.id,
    email: acc.email,
    name: acc.name,
    role: "driver",
    isGuest: false,
    driverModeActive: Boolean(acc.driverModeActive),
    createdAt: acc.createdAt,
  };
}

// --- Revoked Token Registry (for immediate logout invalidation) ---

const revokedJtis = new Map<string, number>();

function pruneRevokedTokens(): void {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const [jti, exp] of revokedJtis.entries()) {
    if (exp <= nowSec) {
      revokedJtis.delete(jti);
    }
  }
}

export function revokeAuthToken(jti: string, exp?: number): void {
  pruneRevokedTokens();
  const expiry = exp && Number.isFinite(exp) ? exp : Math.floor(Date.now() / 1000) + DRIVER_TOKEN_TTL_SECONDS;
  revokedJtis.set(jti, expiry);
}

// --- Rate Limiting for Login / Register ---

interface RateWindow {
  count: number;
  resetAt: number;
}

const authRateWindows = new Map<string, RateWindow>();
const RATE_LIMIT_MAX = 25;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export function assertAuthRateLimit(key: string): void {
  const now = Date.now();
  const current = authRateWindows.get(key);
  if (!current || current.resetAt <= now) {
    authRateWindows.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > RATE_LIMIT_MAX) {
    throw new AuthServiceError(
      "Too many authentication attempts. Please wait a few minutes and try again.",
      429,
      "RATE_LIMITED",
    );
  }
}

// --- JWT Issuance & Verification ---

export async function issueSessionToken(user: AuthUserPublic): Promise<{
  token: string;
  expiresIn: number;
  jti: string;
}> {
  const secret = getJwtSecretBytes();
  const ttlSeconds = user.isGuest ? GUEST_TOKEN_TTL_SECONDS : DRIVER_TOKEN_TTL_SECONDS;
  const jti = crypto.randomUUID();

  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    isGuest: user.isGuest,
    driverModeActive: user.role === "driver" ? Boolean(user.driverModeActive) : false,
    createdAt: user.createdAt,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(user.id)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);

  return { token, expiresIn: ttlSeconds, jti };
}

export async function verifySessionToken(token: string): Promise<VerifiedAuthSession> {
  if (!token || typeof token !== "string" || !token.trim()) {
    throw new AuthServiceError("Authentication token is missing.", 401, "AUTH_REQUIRED");
  }

  const secret = getJwtSecretBytes();
  try {
    const { payload } = await jwtVerify(token.trim(), secret, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    const jti = typeof payload.jti === "string" ? payload.jti : "";
    if (!jti || !payload.sub) {
      throw new AuthServiceError("Authentication token payload is invalid.", 401, "TOKEN_INVALID");
    }

    pruneRevokedTokens();
    if (revokedJtis.has(jti)) {
      throw new AuthServiceError("Session has been logged out. Please sign in again.", 401, "TOKEN_REVOKED");
    }

    const role: AuthRole = payload.role === "driver" ? "driver" : "guest";
    const isGuest = role === "guest" || Boolean(payload.isGuest);

    // Sync driverModeActive from persisted driver record when available
    let driverModeActive = role === "driver" && Boolean(payload.driverModeActive);
    let name = typeof payload.name === "string" ? payload.name : isGuest ? "Guest Driver" : "Driver";
    let email = typeof payload.email === "string" ? payload.email : null;
    let createdAt = typeof payload.createdAt === "number" ? payload.createdAt : Date.now();

    if (role === "driver") {
      ensureStoreLoaded();
      const stored = accountsById.get(payload.sub);
      if (stored) {
        driverModeActive = Boolean(stored.driverModeActive);
        name = stored.name;
        email = stored.email;
        createdAt = stored.createdAt;
      }
    }

    return {
      user: {
        id: payload.sub,
        email,
        name,
        role,
        isGuest,
        driverModeActive,
        createdAt,
      },
      jti,
      exp: typeof payload.exp === "number" ? payload.exp : 0,
      iat: typeof payload.iat === "number" ? payload.iat : 0,
    };
  } catch (err) {
    if (err instanceof AuthServiceError) throw err;
    if (err instanceof joseErrors.JWTExpired) {
      throw new AuthServiceError("Your session has expired. Please sign in again.", 401, "TOKEN_EXPIRED");
    }
    throw new AuthServiceError("Authentication token is invalid.", 401, "TOKEN_INVALID");
  }
}

// --- Public Auth Operations ---

export async function registerDriverAccount(params: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ user: AuthUserPublic; token: string; expiresIn: number }> {
  ensureStoreLoaded();

  const normalizedEmail = String(params.email || "").trim().toLowerCase();
  const password = String(params.password || "");
  const rawName = typeof params.name === "string" ? params.name.trim() : "";

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new AuthServiceError("Please enter a valid email address.", 400, "INVALID_EMAIL");
  }
  if (password.length < 8) {
    throw new AuthServiceError("Password must be at least 8 characters long.", 400, "WEAK_PASSWORD");
  }
  if (password.length > 128) {
    throw new AuthServiceError("Password is too long.", 400, "INVALID_PASSWORD");
  }

  if (accountIdByEmail.has(normalizedEmail)) {
    throw new AuthServiceError(
      "An account with this email already exists. Please sign in instead.",
      409,
      "EMAIL_EXISTS",
    );
  }

  const now = Date.now();
  const displayName =
    rawName.slice(0, 60) ||
    normalizedEmail
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const account: StoredDriverAccount = {
    id: `drv_${crypto.randomUUID()}`,
    email: normalizedEmail,
    name: displayName,
    role: "driver",
    passwordHash: hashPassword(password),
    driverModeActive: false,
    createdAt: now,
    updatedAt: now,
  };

  accountsById.set(account.id, account);
  accountIdByEmail.set(normalizedEmail, account.id);
  persistStore();

  const user = toPublicUser(account);
  const { token, expiresIn } = await issueSessionToken(user);
  return { user, token, expiresIn };
}

export async function loginDriverAccount(params: {
  email: string;
  password: string;
}): Promise<{ user: AuthUserPublic; token: string; expiresIn: number }> {
  ensureStoreLoaded();

  const normalizedEmail = String(params.email || "").trim().toLowerCase();
  const password = String(params.password || "");

  if (!EMAIL_REGEX.test(normalizedEmail) || !password) {
    throw new AuthServiceError("Valid email and password are required.", 400, "INVALID_INPUT");
  }

  const accountId = accountIdByEmail.get(normalizedEmail);
  const account = accountId ? accountsById.get(accountId) : undefined;

  if (!account || !verifyPassword(password, account.passwordHash)) {
    throw new AuthServiceError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  }

  const user = toPublicUser(account);
  const { token, expiresIn } = await issueSessionToken(user);
  return { user, token, expiresIn };
}

export async function createGuestSession(): Promise<{
  user: AuthUserPublic;
  token: string;
  expiresIn: number;
}> {
  const user: AuthUserPublic = {
    id: `guest_${crypto.randomUUID()}`,
    email: null,
    name: "Guest User",
    role: "guest",
    isGuest: true,
    driverModeActive: false,
    createdAt: Date.now(),
  };

  const { token, expiresIn } = await issueSessionToken(user);
  return { user, token, expiresIn };
}

export async function setDriverModeForUser(
  session: VerifiedAuthSession,
  active: boolean,
): Promise<{ user: AuthUserPublic; token: string; expiresIn: number }> {
  if (session.user.role !== "driver" || session.user.isGuest) {
    throw new AuthServiceError(
      "Driver Mode requires a signed-in driver account. Guest users cannot activate Driver Mode.",
      403,
      "DRIVER_ROLE_REQUIRED",
    );
  }

  ensureStoreLoaded();
  const stored = accountsById.get(session.user.id);
  const updatedUser: AuthUserPublic = {
    ...session.user,
    role: "driver",
    isGuest: false,
    driverModeActive: Boolean(active),
  };

  if (stored) {
    stored.driverModeActive = Boolean(active);
    stored.updatedAt = Date.now();
    accountsById.set(stored.id, stored);
    persistStore();
  }

  // Rotate token so JWT claims immediately reflect updated driverModeActive
  revokeAuthToken(session.jti, session.exp);
  const { token, expiresIn } = await issueSessionToken(updatedUser);
  return { user: updatedUser, token, expiresIn };
}
