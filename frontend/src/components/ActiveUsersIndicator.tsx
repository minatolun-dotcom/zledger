// Active users indicator: shows avatars of users currently active in the company.
// Fetches active users every 60 seconds and displays them in the sidebar.

import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuthStore } from "../store/auth";

interface ActiveUser {
  user_id: string;
  name: string;
  email: string;
  last_seen_at: string;
  current_page: string | null;
}

interface ActiveUsersResponse {
  users: ActiveUser[];
  count: number;
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

export default function ActiveUsersIndicator() {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [showTooltip, setShowTooltip] = useState(false);
  const activeCompanyId = useAuthStore((s) => s.activeCompanyId);
  const currentUser = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!activeCompanyId) return;

    const fetchActive = async () => {
      try {
        const res = await api.get<ActiveUsersResponse>("/activity/active-users");
        setActiveUsers(res.users);
      } catch {
        // Silently ignore
      }
    };

    fetchActive();
    const interval = setInterval(fetchActive, 60_000);

    return () => clearInterval(interval);
  }, [activeCompanyId]);

  // Filter out current user
  const otherUsers = activeUsers.filter((u) => u.user_id !== currentUser?.id);

  if (otherUsers.length === 0) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Avatar stack */}
      <div className="flex -space-x-2">
        {otherUsers.slice(0, 5).map((u) => (
          <div
            key={u.user_id}
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white dark:border-[#16161f] ${getColorForUser(u.user_id)}`}
            title={`${u.name} — ${u.current_page || "/"}`}
          >
            {getInitials(u.name)}
          </div>
        ))}
        {otherUsers.length > 5 && (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-300 text-[10px] font-bold text-slate-700 dark:border-[#16161f] dark:bg-slate-600 dark:text-slate-200">
            +{otherUsers.length - 5}
          </div>
        )}
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-[#1a1a24] dark:bg-[#1e1e2a]">
          <p className="mb-2 text-xs font-semibold text-slate-900 dark:text-[#f1f5f9]">
            Active now ({otherUsers.length})
          </p>
          <div className="space-y-1.5">
            {otherUsers.map((u) => (
              <div key={u.user_id} className="flex items-center gap-2 text-xs">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white ${getColorForUser(u.user_id)}`}
                >
                  {getInitials(u.name)}
                </div>
                <span className="text-slate-700 dark:text-[#cbd5e1]">{u.name}</span>
                <span className="text-slate-400 dark:text-[#64748b]">
                  {u.current_page || "/"}
                </span>
              </div>
            ))}
          </div>
          <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white dark:border-[#1a1a24] dark:bg-[#1e1e2a]" />
        </div>
      )}
    </div>
  );
}
