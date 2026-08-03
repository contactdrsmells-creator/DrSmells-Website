import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  ADMIN_MAX_AGE,
  AdminRole,
  createSessionToken,
  getAdminSession,
  getSupabase,
  hashPassword,
  verifyPassword,
} from "@/lib/admin-auth";

/**
 * Admin login.
 *
 * Accounts live in admin_users. ADMIN_PASSWORD remains as a bootstrap so an
 * existing deployment isn't locked out before the first account exists — but
 * only while no active super admin exists, after which it stops being accepted.
 *
 * The previous hardcoded "drsmells2024" fallback is gone: if ADMIN_PASSWORD
 * were ever unset, that public default granted full admin access.
 */
export async function POST(request: Request) {
  const { email, password } = await request.json().catch(() => ({}));

  if (!password) {
    return Response.json({ success: false, error: "Password required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const store = await cookies();

  const setSession = (session: { id: string; email: string; name: string; role: AdminRole }) => {
    store.set(ADMIN_COOKIE, createSessionToken(session), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ADMIN_MAX_AGE,
      path: "/",
    });
  };

  // Normal path: an account in admin_users.
  if (email) {
    const { data: user } = await supabase
      .from("admin_users")
      .select("*")
      .ilike("email", String(email).trim())
      .maybeSingle();

    // Same message for unknown email and wrong password, so the form can't be
    // used to discover which accounts exist.
    if (!user || !verifyPassword(password, user.password_hash)) {
      return Response.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }
    if (!user.active) {
      return Response.json({ success: false, error: "This account has been disabled" }, { status: 403 });
    }

    setSession({ id: user.id, email: user.email, name: user.name, role: user.role });
    await supabase
      .from("admin_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);

    return Response.json({ success: true, role: user.role, name: user.name });
  }

  // Bootstrap: shared password, accepted only while no super admin exists.
  const { count } = await supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("active", true);

  if ((count || 0) > 0) {
    return Response.json(
      { success: false, error: "Please sign in with your email and password" },
      { status: 401 },
    );
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || password !== adminPassword) {
    return Response.json({ success: false, error: "Invalid password" }, { status: 401 });
  }

  setSession({ id: "bootstrap", email: "bootstrap", name: "Super Admin", role: "super_admin" });
  return Response.json({ success: true, role: "super_admin", bootstrap: true });
}

/** Who am I — the admin UI uses this to decide what to show. */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return Response.json({ authenticated: false });

  return Response.json({
    authenticated: true,
    id: session.id,
    email: session.email,
    name: session.name,
    role: session.role,
  });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  return Response.json({ success: true });
}

/** Lets a signed-in admin change their own password. */
export async function PUT(request: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.id === "bootstrap") {
    return Response.json({ error: "Create a real admin account first" }, { status: 400 });
  }

  const { current_password, new_password } = await request.json().catch(() => ({}));
  if (!new_password || String(new_password).length < 8) {
    return Response.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: user } = await supabase
    .from("admin_users").select("password_hash").eq("id", session.id).single();

  if (!user || !verifyPassword(String(current_password || ""), user.password_hash)) {
    return Response.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  await supabase
    .from("admin_users")
    .update({ password_hash: hashPassword(String(new_password)) })
    .eq("id", session.id);

  return Response.json({ success: true });
}
