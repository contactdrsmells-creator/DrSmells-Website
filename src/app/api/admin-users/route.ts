import {
  AdminRole,
  ROLE_LABELS,
  getSupabase,
  hashPassword,
  requirePermission,
} from "@/lib/admin-auth";

const ROLES: AdminRole[] = ["super_admin", "designer", "viewer"];

/** Managing admins is super-admin only — "*" is the only permission that grants it. */
const MANAGE = "users.manage";

export async function GET() {
  const auth = await requirePermission(MANAGE);
  if (auth instanceof Response) return auth;

  const supabase = getSupabase();
  // password_hash is never selected, so it can't leak to the browser.
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, email, name, role, active, last_login_at, created_at")
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ users: data || [], roles: ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] })) });
}

export async function POST(request: Request) {
  const auth = await requirePermission(MANAGE);
  if (auth instanceof Response) return auth;

  const { email, name, password, role } = await request.json().catch(() => ({}));

  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail.includes("@")) return Response.json({ error: "A valid email is required" }, { status: 400 });
  if (!String(name || "").trim()) return Response.json({ error: "Name is required" }, { status: 400 });
  if (String(password || "").length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!ROLES.includes(role)) return Response.json({ error: "Unknown role" }, { status: 400 });

  const supabase = getSupabase();
  const { error } = await supabase.from("admin_users").insert({
    email: cleanEmail,
    name: String(name).trim(),
    password_hash: hashPassword(String(password)),
    role,
    active: true,
  });

  if (error) {
    const duplicate = error.code === "23505" || /duplicate/i.test(error.message);
    return Response.json(
      { error: duplicate ? "An account with that email already exists" : error.message },
      { status: duplicate ? 409 : 500 },
    );
  }

  return Response.json({ success: true });
}

export async function PUT(request: Request) {
  const auth = await requirePermission(MANAGE);
  if (auth instanceof Response) return auth;

  const { id, name, role, active, password } = await request.json().catch(() => ({}));
  if (!id) return Response.json({ error: "User id required" }, { status: 400 });

  const supabase = getSupabase();

  // Guard against removing the last way in: a super admin can't demote or
  // disable themselves out of existence.
  if (role !== undefined || active !== undefined) {
    const losingAccess = (role !== undefined && role !== "super_admin") || active === false;

    if (losingAccess) {
      const { data: target } = await supabase
        .from("admin_users").select("role, active").eq("id", id).single();

      if (target?.role === "super_admin" && target?.active) {
        const { count } = await supabase
          .from("admin_users")
          .select("id", { count: "exact", head: true })
          .eq("role", "super_admin")
          .eq("active", true);

        if ((count || 0) <= 1) {
          return Response.json(
            { error: "This is the only active Super Admin — promote someone else first" },
            { status: 400 },
          );
        }
      }
    }
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (active !== undefined) updates.active = active === true;
  if (role !== undefined) {
    if (!ROLES.includes(role)) return Response.json({ error: "Unknown role" }, { status: 400 });
    updates.role = role;
  }
  if (password) {
    if (String(password).length < 8) {
      return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    updates.password_hash = hashPassword(String(password));
  }

  if (!Object.keys(updates).length) return Response.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await supabase.from("admin_users").update(updates).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requirePermission(MANAGE);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "User id required" }, { status: 400 });

  if (id === auth.id) {
    return Response.json({ error: "You can't delete your own account" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: target } = await supabase
    .from("admin_users").select("role, active").eq("id", id).single();

  if (target?.role === "super_admin" && target?.active) {
    const { count } = await supabase
      .from("admin_users")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin")
      .eq("active", true);

    if ((count || 0) <= 1) {
      return Response.json(
        { error: "This is the only active Super Admin — promote someone else first" },
        { status: 400 },
      );
    }
  }

  const { error } = await supabase.from("admin_users").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
