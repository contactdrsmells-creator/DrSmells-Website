"use client";

import { useEffect, useState } from "react";
import { Plus, Shield, Trash2, X, KeyRound, UserCheck, UserX } from "lucide-react";
import { AdminRole, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/admin-roles";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

const ROLES: AdminRole[] = ["super_admin", "designer", "viewer"];

const ROLE_STYLES: Record<AdminRole, string> = {
  super_admin: "bg-olive text-white",
  designer: "bg-sage/30 text-olive",
  viewer: "bg-gray-100 text-gray-600",
};

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState<AdminUser | null>(null);

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "viewer" as AdminRole });
  const [newPassword, setNewPassword] = useState("");

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin-users");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not load admin accounts");
      setUsers([]);
    } else {
      setError(null);
      setUsers(data.users || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addUser() {
    setSaving(true);
    const res = await fetch("/api/admin-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      alert(data.error || "Could not create the account");
      return;
    }

    setShowAdd(false);
    setForm({ name: "", email: "", password: "", role: "viewer" });
    showToast("Account created");
    load();
  }

  /** Role changes and disabling both go through PUT, which guards the last super admin. */
  async function updateUser(id: string, changes: Record<string, unknown>, message: string) {
    const res = await fetch("/api/admin-users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...changes }),
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Could not update the account");
      return false;
    }
    showToast(message);
    load();
    return true;
  }

  async function resetPassword() {
    if (!resetting) return;
    if (newPassword.length < 8) {
      alert("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    const ok = await updateUser(resetting.id, { password: newPassword }, "Password updated");
    setSaving(false);
    if (ok) {
      setResetting(null);
      setNewPassword("");
    }
  }

  async function deleteUser(user: AdminUser) {
    if (!confirm(`Remove ${user.name}? They will lose access immediately.`)) return;

    const res = await fetch(`/api/admin-users?id=${encodeURIComponent(user.id)}`, {
      method: "DELETE",
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Could not remove the account");
      return;
    }
    showToast("Account removed");
    load();
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-olive flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Admin Users
          </h1>
          <p className="text-sm text-olive/60 mt-1">
            Who can sign in to this panel, and what each of them may change.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* What each role means — so a role is chosen deliberately, not by name alone. */}
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {ROLES.map((role) => (
          <div key={role} className="bg-white border border-gray-200 rounded-xl p-4">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_STYLES[role]}`}>
              {ROLE_LABELS[role]}
            </span>
            <p className="text-xs text-olive/60 mt-2 leading-relaxed">{ROLE_DESCRIPTIONS[role]}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 mb-6 text-sm">
          {error}
          {/* The table is created by supabase-admin-users.sql; say so rather than
              leaving a bare error with no way forward. */}
          {/table/i.test(error) && (
            <p className="mt-1 text-amber-700">
              Run <code className="font-mono">supabase-admin-users.sql</code> in the Supabase SQL
              editor to create the accounts table.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-olive/50 text-sm">Loading…</div>
      ) : users.length === 0 && !error ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-olive/60 text-sm">No admin accounts yet.</p>
          <p className="text-olive/50 text-xs mt-2 max-w-md mx-auto">
            Everyone currently shares the same admin password. Adding the first Super Admin here
            switches that off, so sign-ins are per person from then on.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-olive/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className={user.active ? "" : "bg-gray-50/60"}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-olive">{user.name}</span>
                      {!user.active && (
                        <span className="ml-2 text-xs text-gray-400">(disabled)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-olive/70">{user.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        onChange={(e) =>
                          updateUser(user.id, { role: e.target.value }, "Role updated")
                        }
                        className={`px-2 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer ${ROLE_STYLES[user.role]}`}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role} className="bg-white text-olive">
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-olive/50 text-xs">
                      {formatDate(user.last_login_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setResetting(user)}
                          title="Set a new password"
                          className="p-2 text-gray-400 hover:text-olive hover:bg-gray-100 rounded-lg"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            updateUser(
                              user.id,
                              { active: !user.active },
                              user.active ? "Account disabled" : "Account enabled",
                            )
                          }
                          title={user.active ? "Disable access" : "Restore access"}
                          className="p-2 text-gray-400 hover:text-olive hover:bg-gray-100 rounded-lg"
                        >
                          {user.active ? (
                            <UserX className="w-4 h-4" />
                          ) : (
                            <UserCheck className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => deleteUser(user)}
                          title="Remove account"
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-olive/40 mt-4">
        Disabling keeps someone&apos;s history but blocks sign-in — usually the right choice when a
        person leaves. Removing deletes the account outright.
      </p>

      {/* Add user */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-olive">Add Admin User</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-olive">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-olive/70 mb-1">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="Ah Hui"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-olive/70 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="name@drsmells.com.my"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-olive/70 mb-1">
                  Password <span className="text-olive/40">(at least 8 characters)</span>
                </label>
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                  placeholder="Give this to them, they can change it later"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-olive/70 mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-olive/50 mt-1">{ROLE_DESCRIPTIONS[form.role]}</p>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-olive/70"
              >
                Cancel
              </button>
              <button
                onClick={addUser}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark disabled:opacity-50"
              >
                {saving ? "Creating…" : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password */}
      {resetting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-olive">Set New Password</h2>
              <button
                onClick={() => {
                  setResetting(null);
                  setNewPassword("");
                }}
                className="text-gray-400 hover:text-olive"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-olive/60 mb-4">
              For {resetting.name} ({resetting.email})
            </p>

            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
              placeholder="At least 8 characters"
            />

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  setResetting(null);
                  setNewPassword("");
                }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-olive/70"
              >
                Cancel
              </button>
              <button
                onClick={resetPassword}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark disabled:opacity-50"
              >
                {saving ? "Saving…" : "Set Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-olive text-white px-4 py-2.5 rounded-lg text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
