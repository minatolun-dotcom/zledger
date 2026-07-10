import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";

interface Notification {
  id: string;
  title: string;
  message: string;
  category: string;
  link: string | null;
  is_read: boolean;
  created_at: string | null;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const toast = useToastStore();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.get<Notification[]>("/notifications");
      setNotifications(data);
      const countData = await api.get<{ count: number }>("/notifications/unread-count");
      setUnreadCount(countData.count);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const markRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      toast.error("Failed to mark as read");
    }
  };

  const markAllRead = async () => {
    try {
      await api.post("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  const handleClick = (n: Notification) => {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const categoryColors: Record<string, string> = {
    info: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
    warning: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
    error: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
    success: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
    gst_due: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400",
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#282832] dark:hover:text-slate-300 transition-colors"
        title="Notifications"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[9999] mt-2 w-80 max-h-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-[#282832] dark:bg-[#16161f]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-[#282832]">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-[#64748b]">No notifications</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-[#1e1e28] ${!n.is_read ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
                >
                  <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${categoryColors[n.category] || categoryColors.info}`}>
                    {n.category === "gst_due" ? "G" : n.category.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium ${!n.is_read ? "text-slate-900 dark:text-[#f1f5f9]" : "text-slate-600 dark:text-[#cbd5e1]"}`}>{n.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-[#64748b]">{n.message}</p>
                  </div>
                  {!n.is_read && <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
