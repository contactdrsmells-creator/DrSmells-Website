import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Admin authentication and roles.
 *
 * Sessions are HMAC-signed. The previous token was base64("admin:" + timestamp)
 * with no signature, so anyone could construct one and paste it into a cookie
 * to get full admin access — every route only checked that the cookie existed.
 * Roles would be decorative on top of that, so signing is part of this change.
 */

// Roles live in admin-roles.ts so the browser can import them without pulling
// in next/headers. Re-exported so server code has a single import site.
import { AdminSession, ROLE_LABELS, hasPermission } from "./admin-roles";

export * from "./admin-roles";

const COOKIE = "admin_token";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function sessionSecret(): string {
  // Falls back to ADMIN_PASSWORD so an existing deployment keeps working
  // before ADMIN_SESSION_SECRET is set.
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(session: AdminSession): string {
  const body = Buffer.from(
    JSON.stringify({ ...session, exp: Date.now() + MAX_AGE_SECONDS * 1000 }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

function verifySessionToken(token: string | undefined): (AdminSession & { exp: number }) | null {
  if (!token || !token.includes(".")) return null;

  const [body, signature] = token.split(".");
  const expected = sign(body);

  // Compare as buffers of equal length; a mismatched length is already a fail.
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!parsed?.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The signed-in admin, or null. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const verified = verifySessionToken(store.get(COOKIE)?.value);
  if (!verified) return null;

  const { id, email, name, role } = verified;
  return { id, email, name, role };
}

/**
 * Guard for API routes. Returns the session, or a Response to return directly.
 *
 *   const auth = await requirePermission("content.edit");
 *   if (auth instanceof Response) return auth;
 */
export async function requirePermission(
  permission: string,
): Promise<AdminSession | Response> {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, permission)) {
    return Response.json(
      { error: `Your role (${ROLE_LABELS[session.role]}) cannot perform this action` },
      { status: 403 },
    );
  }
  return session;
}

// ── Passwords ────────────────────────────────────────────────────────────────
// scrypt from Node's crypto, so no dependency is added just to hash passwords.

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;

  const derived = scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(derived);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export { COOKIE as ADMIN_COOKIE, MAX_AGE_SECONDS as ADMIN_MAX_AGE };
