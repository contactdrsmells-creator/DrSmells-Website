import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Shop-side accounts, kept entirely apart from the admin's.
 *
 * A customer signs in with the mobile number they order with, so the account
 * and the order history find each other without anyone typing an order
 * number. The session is deliberately long: a customer checking a points
 * balance should not be asked to prove who they are every week, and once
 * WhatsApp codes are added each sign-in costs real money to send.
 */

const COOKIE = "customer_token";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

export interface CustomerSession {
  id: string;
  phone: string;
  name: string | null;
}

function sessionSecret(): string {
  const secret = process.env.CUSTOMER_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("CUSTOMER_SESSION_SECRET is not configured");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createCustomerToken(session: CustomerSession): string {
  const body = Buffer.from(
    JSON.stringify({ ...session, exp: Date.now() + MAX_AGE_SECONDS * 1000 }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

function verifyToken(token: string | undefined): (CustomerSession & { exp: number }) | null {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = sign(body);
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

export async function getCustomerSession(): Promise<CustomerSession | null> {
  const store = await cookies();
  const verified = verifyToken(store.get(COOKIE)?.value);
  if (!verified) return null;
  return { id: verified.id, phone: verified.phone, name: verified.name };
}

/**
 * The same scrypt hashing the admin accounts use — no new dependency, and one
 * way of storing a password across the whole project.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored || !stored.includes(":")) return false;
  const [salt, key] = stored.split(":");
  const derived = scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(key);
  const b = Buffer.from(derived);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * One spelling of a phone number, so the same customer typing "012-345 6789",
 * "+60123456789" or "0123456789" is recognised as themselves — and matches the
 * number their orders were placed under.
 */
export function normalisePhone(raw: string): string | null {
  let num = String(raw || "").replace(/[\s\-().+]/g, "");
  if (!/^\d+$/.test(num)) return null;
  if (num.startsWith("0")) num = `60${num.slice(1)}`;
  else if (!num.startsWith("60") && num.length <= 10) num = `60${num}`;
  // A Malaysian mobile is 60 followed by 9 or 10 digits.
  if (num.length < 10 || num.length > 15) return null;
  return num;
}

export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  );
}

export const CUSTOMER_COOKIE = COOKIE;
export const CUSTOMER_MAX_AGE = MAX_AGE_SECONDS;

/** The cookie settings every customer sign-in and sign-out writes. */
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
