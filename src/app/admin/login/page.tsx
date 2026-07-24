"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();

    if (data.success) {
      router.push("/admin");
      router.refresh();
    } else {
      setError("Invalid password. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto bg-olive/10 rounded-2xl flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-olive" />
          </div>
          <h1 className="text-2xl font-bold text-olive">Admin Login</h1>
          <p className="text-olive/60 text-sm mt-1">Dr.Smells Management Panel</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-olive mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-olive/20 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-olive/30 focus:border-olive text-olive"
              placeholder="Enter admin password"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 bg-olive text-white font-semibold rounded-xl hover:bg-sage-dark transition-colors disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <p className="text-center text-olive/40 text-xs mt-6">
          Default password: drsmells2024
        </p>
      </div>
    </div>
  );
}
