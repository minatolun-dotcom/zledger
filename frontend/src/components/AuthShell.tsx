import type { ReactNode } from "react";

/* Shared brand mark — matches the TopHeader logo (gradient tile + "Z") */
export function AuthBrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-9 w-9 rounded-xl" : "h-12 w-12 rounded-2xl";
  const icon = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <div
      className={`${box} flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/25`}
    >
      <svg viewBox="0 0 24 24" className={icon} fill="none">
        <path d="M6 6h12l-10 6h8L6 18h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
      </svg>
    </div>
  );
}

const FEATURES: { title: string; desc: string; icon: ReactNode }[] = [
  {
    title: "GST-Ready Accounting",
    desc: "Sales, purchases, payments & GST returns in one place",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
      </svg>
    ),
  },
  {
    title: "Tally-Style Workflows",
    desc: "F-key shortcuts and keyboard-first voucher entry",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    title: "Multi-Company",
    desc: "Run several entities and switch between them instantly",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
      </svg>
    ),
  },
  {
    title: "Reports & Compliance",
    desc: "P&L, balance sheet, e-invoicing, TDS/TCS and more",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
];

export interface AuthBranding {
  logoUrl?: string | null;
  name?: string;
}

interface AuthShellProps {
  title: string;
  subtitle: string;
  footer: ReactNode;
  children: ReactNode;
  /** Optional company branding shown in the hero (logo + name). */
  branding?: AuthBranding;
  /** Wider layout — used by multi-section forms (e.g. company creation). */
  wide?: boolean;
}

export default function AuthShell({ title, subtitle, footer, children, branding, wide = false }: AuthShellProps) {
  const brandName = branding?.name || "Zledger";
  return (
    <div className="flex min-h-full items-center justify-center p-4 sm:p-8">
      <div
        className={`grid w-full animate-fadeIn overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 dark:bg-[#16161f] dark:shadow-dark-xl dark:ring-[#1a1a24] ${
          wide ? "max-w-7xl lg:grid-cols-[0.7fr_1.3fr]" : "max-w-4xl lg:grid-cols-[1.05fr_1fr]"
        }`}
      >
        {/* ── Brand hero panel (desktop) ── */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 p-10 text-white lg:flex lg:min-h-[540px] dark:from-[#101826] dark:via-[#0e1a2b] dark:to-[#0b1320]">
          {/* Decorative glows */}
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl dark:bg-blue-500/10" />
          <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-blue-300/10 blur-3xl dark:bg-blue-400/5" />

          <div className="relative">
            <div className="flex items-center gap-3">
              {branding?.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={brandName}
                  className="h-10 w-10 rounded-xl bg-white/15 object-contain p-1 ring-1 ring-white/20"
                />
              ) : (
                <AuthBrandMark />
              )}
              <span className="text-xl font-bold tracking-tight">{brandName}</span>
            </div>

            <h2 className="mt-12 text-3xl font-bold leading-tight tracking-tight">
              Indian accounting,
              <br />
              <span className="bg-gradient-to-r from-blue-200 to-cyan-200 bg-clip-text text-transparent dark:from-blue-300 dark:to-cyan-300">
                reimagined for speed.
              </span>
            </h2>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-blue-100/80 dark:text-[#cbd5e1]/80">
              GST-ready books, Tally-style keyboard workflows and compliance reports — built for
              Indian businesses and accountants.
            </p>
          </div>

          <div className="relative mt-10 space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3.5">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-blue-50 ring-1 ring-white/15 dark:bg-white/5 dark:text-[#f1f5f9]">
                  {f.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white dark:text-[#f1f5f9]">{f.title}</p>
                  <p className="text-[13px] text-blue-100/70 dark:text-[#94a3b8]">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="relative mt-8 text-xs text-blue-100/60 dark:text-[#64748b]">
            Trusted by accountants · Works offline-first · Data stays on your infrastructure
          </p>
        </div>

        {/* ── Form panel ── */}
        <div className="flex flex-col justify-center p-8 sm:p-12">
          {/* Compact brand header (mobile only) */}
          <div className="mb-8 flex flex-col items-center lg:hidden">
            {branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={brandName}
                className="h-11 w-11 rounded-xl bg-white object-contain p-1 ring-1 ring-slate-200 dark:bg-[#1a1a24] dark:ring-[#282832]"
              />
            ) : (
              <AuthBrandMark />
            )}
            <span className="mt-3 text-lg font-bold tracking-tight text-slate-900 dark:text-[#f1f5f9]">
              {brandName}
            </span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-[#cbd5e1]">{subtitle}</p>

          <div className="mt-8">{children}</div>

          <div className="mt-8 border-t border-slate-100 pt-6 dark:border-[#1a1a24]">
            <p className="text-center text-sm text-slate-500 dark:text-[#cbd5e1]">{footer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
