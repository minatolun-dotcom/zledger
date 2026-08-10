import { useState, type FormEvent } from "react";
import { useAuthStore } from "../store/auth";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { useThemeStore } from "../store/theme";
import Tabs from "../components/Tabs";
import { PAGE_TAB_DEFS } from "../config/pageTabs";
import TabContent from "../components/TabContent";

export default function ProfilePage() {
  const { user, fetchMe } = useAuthStore();
  const toast = useToastStore();
  const { theme, setTheme } = useThemeStore();

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activeTab, setActiveTab] = useState<"profile" | "security">("profile");

  const handleProfileUpdate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.patch("/auth/me", { name, email });
      await fetchMe();
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update profile");
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    try {
      await api.patch("/auth/me/password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to change password");
    }
  };

  const initials = user?.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";

  const inputCls =
    "mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm bg-white dark:bg-[#0f0f16] text-slate-900 dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors";
  const labelCls = "block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">My Profile</h1>

      {/* Avatar banner */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200/60 bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent p-6 dark:border-[#1a1a24] dark:from-blue-500/10">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-xl font-bold text-white uppercase shadow-lg shadow-blue-500/20">
            {initials}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9] truncate">{user?.name}</h2>
            <p className="text-sm text-slate-500 dark:text-[#64748b] truncate">{user?.email}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  user?.is_superadmin
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                }`}
              >
                {user?.is_superadmin ? "Superadmin" : "User"}
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={PAGE_TAB_DEFS["/profile"].tabs}
        active={activeTab}
        onChange={(k) => setActiveTab(k as "profile" | "security")}
      />

      <TabContent activeKey={activeTab}>
        {/* Profile Tab */}
        {activeTab === "profile" && (
          <form onSubmit={handleProfileUpdate} className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-[#1a1a24] dark:bg-[#16161f]">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1] mb-4">Profile Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} required />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button type="submit" className="btn-primary px-5 py-2 text-sm font-medium">
                Update Profile
              </button>
            </div>
          </form>
        )}

        {/* Security Tab */}
        {activeTab === "security" && (
          <div className="space-y-6">
            {/* Password */}
            <form onSubmit={handlePasswordChange} className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-[#1a1a24] dark:bg-[#16161f]">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1] mb-4">Change Password</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Current Password</label>
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>New Password</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} minLength={8} required />
                </div>
                <div>
                  <label className={labelCls}>Confirm New Password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} minLength={8} required />
                </div>
              </div>
              <div className="mt-6">
                <button type="submit" className="btn-primary px-5 py-2 text-sm font-medium">
                  Change Password
                </button>
              </div>
            </form>

            {/* Appearance */}
            <div className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-[#1a1a24] dark:bg-[#16161f]">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1] mb-4">Appearance</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Theme</p>
                  <p className="text-xs text-slate-500 dark:text-[#64748b]">Switch between light and dark mode</p>
                </div>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-slate-200 bg-slate-100 transition-colors dark:border-[#282832] dark:bg-[#0f0f16]"
                >
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform dark:bg-[#282832] ${
                      theme === "dark" ? "translate-x-6" : "translate-x-1"
                    }`}
                  >
                    {theme === "dark" ? (
                      <svg className="h-3 w-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" /></svg>
                    ) : (
                      <svg className="h-3 w-3 text-slate-600" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </TabContent>
    </div>
  );
}
