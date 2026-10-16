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
import { AdminRole, AdminSession, ROLE_LABELS, hasPermission } from "./admin-roles";

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

/**
 * The signed-in admin, or null.
 *
 * The cookie says who this is; the database says what they may do. The role
 * used to be read straight off the cookie, which is written once at sign-in
 * and then trusted for a week — so changing somebody's role did nothing until
 * they happened to sign in again. A super admin promoted this morning still
 * saw a viewer's single Orders page, and, the other way round, somebody
 * demoted or disabled kept full control for up to seven days.
 *
 * So the role and the account's standing are looked up each time. That is one
 * small query per admin request, which the admin panel can afford and the shop
 * front never pays — nothing here runs on a customer's page.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const verified = verifySessionToken(store.get(COOKIE)?.value);
  if (!verified) return null;

  const { id, email, name, role } = verified;

  // The bootstrap sign-in has no row to check: it is accepted only while no
  // active super admin exists, and the login route settles that.
  if (id === "bootstrap") return { id, email, name, role };

  const { data, error } = await getSupabase()
    .from("admin_users")
    .select("role, active, name")
    .eq("id", id)
    .maybeSingle();

  // No row means the account was removed, and a failed lookup means the
  // account cannot be vouched for. Both refuse: a stale cookie granting
  // access is the failure worth avoiding, and the cost of being wrong is one
  // sign-in, not a lost order.
  if (error) {
    console.error("[Admin] Could not confirm the signed-in account:", error.message);
    return null;
  }
  if (!data || !data.active) return null;

  return { id, email, name: data.name || name, role: data.role as AdminRole };
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
