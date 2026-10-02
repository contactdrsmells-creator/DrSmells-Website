"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Signing in with the mobile number orders are placed under.
 *
 * One screen for both signing in and opening an account: a shop this size has
 * customers who cannot remember which they did last, and making them choose
 * before they have typed anything is a question they should not have to answer.
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/customer/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      router.push("/account");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white px-4 py-12">
      <div className="max-w-sm mx-auto">
        <h1 className="text-2xl font-bold text-olive mb-1">
          {mode === "login" ? "Log in" : "Create an account"}
        </h1>
        <p className="text-sm text-olive/50 mb-6">
          {mode === "login"
            ? "Use the mobile number you order with."
            : "Earn points on everything you buy."}
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-olive/70 mb-1">Mobile number</label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="012-345 6789"
              required
              className="w-full px-4 py-2.5 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
            />
          </div>

          {mode === "register" && (
            <div>
              <label className="block text-xs font-medium text-olive/70 mb-1">Name</label>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-olive/70 mb-1">Password</label>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2.5 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 bg-olive text-cream font-semibold rounded-lg hover:bg-sage-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
          className="w-full mt-4 text-sm text-olive/60 hover:text-olive underline"
        >
          {mode === "login"
            ? "No account yet? Create one"
            : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
