"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

/**
 * After logging in with a WhatsApp code, the customer must choose a password
 * before using the site. Shown over every page until they do; the only other
 * way out is logging out. The server refuses the session elsewhere meanwhile,
 * so this is the visible half of a rule that is enforced there.
 *
 * Only asks the server when the hint cookie is present, so ordinary visitors
 * never pay for this check.
 */
export default function SetPasswordGate() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (pathname?.startsWith("/admin")) return;
    if (!document.cookie.split("; ").some((c) => c.startsWith("must_set_password=1"))) return;
    fetch("/api/customer/password", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setOpen(!!d.must_set_password);
        setName(String(d.name || "").split(" ")[0]);
      })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("The two passwords do not match");
    setBusy(true);
    try {
      const r = await fetch("/api/customer/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not save the password");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the password");
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/customer/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }

  if (!open) return null;

  const field = "w-full px-3 py-2.5 border border-olive/20 rounded-lg text-sm text-olive focus:outline-none focus:ring-2 focus:ring-olive/30";

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <form onSubmit={save} className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
        <h2 className="text-xl font-bold text-olive mb-1">Set your password</h2>
        <p className="text-sm text-olive/60 mb-5">
          {name ? `Hi ${name}, p` : "P"}lease choose a password to continue. Next time you can log in with your number and this password.
        </p>

        <label className="block text-xs font-medium text-olive/70 mb-1">New password</label>
        <div className="relative mb-3">
          <input type={show ? "text" : "password"} value={password} autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)} className={`${field} pr-10`} autoFocus />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-olive/40">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <label className="block text-xs font-medium text-olive/70 mb-1">Type it again</label>
        <input type={show ? "text" : "password"} value={confirm} autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)} className={`${field} mb-3`} />

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <button type="submit" disabled={busy}
          className="w-full py-3 bg-olive text-white font-medium rounded-lg hover:bg-sage-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save password
        </button>
        <button type="button" onClick={logout} className="w-full mt-3 text-sm text-olive/50 underline underline-offset-2">
          Log out
        </button>
      </form>
    </div>
  );
}
