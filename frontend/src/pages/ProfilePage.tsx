import { useState, type FormEvent } from "react";
import { useAuthStore } from "../store/auth";
import { api } from "../api/client";

export default function ProfilePage() {
  const { user, fetchMe } = useAuthStore();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [error, setError] = useState("");

  const handleProfileUpdate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setProfileMsg("");
    try {
      await api.patch("/auth/me", { name, email });
      await fetchMe();
      setProfileMsg("Profile updated");
    } catch (err: any) {
      setError(err?.detail || "Failed to update profile");
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setPasswordMsg("");
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    try {
      await api.patch("/auth/me/password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordMsg("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.detail || "Failed to change password");
    }
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9] border-b border-slate-200 dark:border-[#1e1e28] pb-2">My Profile</h2>

      <div className="mt-6 space-y-8">
        {/* Profile Form */}
        <form onSubmit={handleProfileUpdate} className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Profile Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm"
                required />
            </div>
          </div>
          {profileMsg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{profileMsg}</p>}
          {error && !profileMsg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Update Profile
          </button>
        </form>

        {/* Password Form */}
        <form onSubmit={handlePasswordChange} className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Change Password</h3>
          <div className="max-w-md space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Current Password</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm"
                minLength={8} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm"
                minLength={8} required />
            </div>
          </div>
          {passwordMsg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{passwordMsg}</p>}
          {error && !passwordMsg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Change Password
          </button>
        </form>

        {/* Account Info */}
        <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Account Information</h3>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-[#94a3b8]">User ID</span>
              <p className="font-mono text-xs">{user?.id}</p>
            </div>
            <div>
              <span className="text-slate-500 dark:text-[#94a3b8]">Role</span>
              <p className="font-medium">{user?.is_superadmin ? "Superadmin" : "User"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
