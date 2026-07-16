import { useState, type FormEvent } from "react";
import { useAuthStore } from "../store/auth";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import PageHeader from "../components/PageHeader";

export default function ProfilePage() {
  const { user, fetchMe } = useAuthStore();
  const toast = useToastStore();
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

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" />

      {/* Avatar + Name Card */}
      <div className="rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-6 shadow-sm dark:border-[#1a1a24] dark:from-[#16161f] dark:to-[#1a1a25]">
        <div className="flex items-center gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-2xl font-bold text-white uppercase shadow-lg shadow-blue-500/20">
            {initials}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-[#f1f5f9]">{user?.name}</h2>
            <p className="text-sm text-slate-500 dark:text-[#64748b]">{user?.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                user?.is_superadmin
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              }`}>
                {user?.is_superadmin ? "Superadmin" : "User"}
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-[#282832] dark:bg-[#1a1a24]">
        {(["profile", "security"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white text-slate-900 shadow-sm dark:bg-[#16161f] dark:text-[#f1f5f9]"
                : "text-slate-500 hover:text-slate-700 dark:text-[#64748b] dark:hover:text-[#cbd5e1]"
            }`}
          >
            {tab === "profile" ? "Profile" : "Security"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "profile" && (
        <form onSubmit={handleProfileUpdate} className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-[#1a1a24] dark:bg-[#16161f] space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Profile Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm bg-white dark:bg-[#0f0f16] text-slate-900 dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm bg-white dark:bg-[#0f0f16] text-slate-900 dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required />
            </div>
          </div>
          <button type="submit" className="btn-primary px-5 py-2 text-sm font-medium">
            Update Profile
          </button>
        </form>
      )}

      {activeTab === "security" && (
        <div className="space-y-6">
          <form onSubmit={handlePasswordChange} className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-[#1a1a24] dark:bg-[#16161f] space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Change Password</h3>
            <div className="max-w-md space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Current Password</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm bg-white dark:bg-[#0f0f16] text-slate-900 dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm bg-white dark:bg-[#0f0f16] text-slate-900 dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  minLength={8} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm bg-white dark:bg-[#0f0f16] text-slate-900 dark:text-[#f1f5f9] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  minLength={8} required />
              </div>
            </div>
            <button type="submit" className="btn-primary px-5 py-2 text-sm font-medium">
              Change Password
            </button>
          </form>

          {/* Active Sessions */}
          <div className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-[#1a1a24] dark:bg-[#16161f]">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Active Sessions</h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-slate-100 p-3 dark:border-[#282832]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <svg className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Current Session</p>
                    <p className="text-xs text-slate-400 dark:text-[#64748b]">Active now</p>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  Current
                </span>
              </div>
            </div>
          </div>

          {/* Account Info */}
          <div className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-[#1a1a24] dark:bg-[#16161f]">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Account Information</h3>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500 dark:text-[#64748b]">User ID</span>
                <p className="mt-0.5 font-mono text-xs text-slate-700 dark:text-[#cbd5e1]">{user?.id}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-[#64748b]">Role</span>
                <p className="mt-0.5 font-medium text-slate-700 dark:text-[#cbd5e1]">{user?.is_superadmin ? "Superadmin" : "User"}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
