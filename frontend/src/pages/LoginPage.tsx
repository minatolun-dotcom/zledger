import { useState, useMemo, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore, getLastCompanyBranding } from "../store/auth";
import AuthShell, { type AuthBranding } from "../components/AuthShell";

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Greet returning users with their last-used company's branding
  const branding = useMemo<AuthBranding | undefined>(() => {
    return getLastCompanyBranding() ?? undefined;
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return; // guard against double submit (Enter key can bypass the disabled button)
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/companies");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={branding?.name ? `Welcome back to ${branding.name}` : "Welcome back"}
      subtitle="Sign in to your Zledger workspace"
      branding={branding}
      footer={
        <>
          No account?{" "}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700 dark:text-blue-400">
            Register
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder-slate-400 transition-colors focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9] dark:placeholder-[#64748b] dark:focus:border-blue-500/50 dark:focus:ring-blue-500/20"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder-slate-400 transition-colors focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9] dark:placeholder-[#64748b] dark:focus:border-blue-500/50 dark:focus:ring-blue-500/20"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full px-4 py-2.5 text-sm font-medium"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
