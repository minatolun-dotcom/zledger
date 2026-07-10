import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuthStore } from "../store/auth";
import { useToastStore } from "../store/toast";
import { ListSkeleton } from "./skeletons";
import PageHeader from "../components/PageHeader";

interface ActiveUser {
  user_id: string;
  name: string;
  email: string;
  last_seen_at: string;
  current_page: string | null;
  ip_address: string | null;
}

interface RecentMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
}

interface CompanyActivity {
  company_id: string;
  company_name: string;
  active_users: ActiveUser[];
  total_active: number;
  recent_members: RecentMember[];
}

interface Company {
  id: string;
  name: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getColorForUser(userId: string): string {
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-indigo-500",
    "bg-teal-500",
  ];
  const hash = userId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return d.toLocaleTimeString();
}

export default function AdminActivityPage() {
  const toast = useToastStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [activity, setActivity] = useState<CompanyActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (selectedCompanyId) loadActivity(selectedCompanyId);
  }, [selectedCompanyId]);

  const loadCompanies = async () => {
    try {
      if (user?.is_superadmin) {
        const res = await api.get<Company[]>("/admin/companies");
        setCompanies(res);
        if (res.length > 0) setSelectedCompanyId(res[0].id);
      } else {
        // Non-superadmins see only their companies
        const me = await api.get<{ companies: { id: string; name: string }[] }>("/auth/me");
        setCompanies(me.companies);
        if (me.companies.length > 0) setSelectedCompanyId(me.companies[0].id);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to load companies");
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async (companyId: string) => {
    setLoadingActivity(true);
    try {
      const res = await api.get<CompanyActivity>(`/activity/companies/${companyId}/activity`);
      setActivity(res);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load activity");
      setActivity(null);
    } finally {
      setLoadingActivity(false);
    }
  };

  const handleForceLogout = async () => {
    if (!selectedCompanyId) return;
    if (!confirm("Terminate all sessions for this company? Users will be logged out on their next action.")) return;
    try {
      await api.post(`/activity/companies/${selectedCompanyId}/force-logout`);
      toast.success("All sessions terminated");
      loadActivity(selectedCompanyId);
    } catch (err: any) {
      toast.error(err?.message || "Failed to terminate sessions");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Company Activity" />
        <ListSkeleton title="Activity" cols={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Activity"
        actions={
          <>
            <select
              value={selectedCompanyId ?? ""}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-[#1a1a24] dark:bg-[#16161f] dark:text-[#f1f5f9]"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {user?.is_superadmin && selectedCompanyId && (
              <button
                onClick={handleForceLogout}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Force Logout All
              </button>
            )}
          </>
        }
      />

      {loadingActivity ? (
        <ListSkeleton title="Activity" cols={4} />
      ) : activity ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Active Users */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-[#e2e8f0]">
                Active Users <span className="text-slate-400 dark:text-[#64748b]">({activity.total_active})</span>
              </h3>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {activity.active_users.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400 dark:text-[#64748b]">No active users</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-[#1e1e28]">
                  {activity.active_users.map((u) => (
                    <div key={u.user_id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${getColorForUser(u.user_id)}`}>
                        {getInitials(u.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{u.name}</p>
                        <p className="text-xs text-slate-400 dark:text-[#64748b]">{u.current_page || "/"}</p>
                      </div>
                      <span className="text-xs text-slate-400 dark:text-[#64748b]">{formatTime(u.last_seen_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Members */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-[#e2e8f0]">
                Recent Members <span className="text-slate-400 dark:text-[#64748b]">({activity.recent_members.length})</span>
              </h3>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {activity.recent_members.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400 dark:text-[#64748b]">No members</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-[#1e1e28]">
                  {activity.recent_members.map((m) => (
                    <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${getColorForUser(m.user_id)}`}>
                        {getInitials(m.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{m.name}</p>
                        <p className="text-xs text-slate-400 dark:text-[#64748b]">{m.email}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        m.role === "owner"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
                          : m.role === "accountant"
                            ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                            : "bg-slate-100 text-slate-500 dark:bg-[#282832] dark:text-[#cbd5e1]"
                      }`}>
                        {m.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
