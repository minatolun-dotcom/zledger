import { useState, type FormEvent } from "react";
import { useAuthStore } from "../store/auth";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";

export default function ProfilePage() {
  const { user, fetchMe } = useAuthStore();
  const toast = useToastStore();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">My Profile</h2>
      </div>

      <div className="mt-6 space-y-8">
        {/* Profile Form */}
        <form onSubmit={handleProfileUpdate} className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Profile Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm bg-white dark:bg-[#111118]"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm bg-white dark:bg-[#111118]"
                required />
            </div>
          </div>
          <button type="submit"
            className="btn-primary px-4 py-1.5 text-sm font-medium">
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
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm bg-white dark:bg-[#111118]"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm bg-white dark:bg-[#111118]"
                minLength={8} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm bg-white dark:bg-[#111118]"
                minLength={8} required />
            </div>
          </div>
          <button type="submit"
            className="btn-primary px-4 py-1.5 text-sm font-medium">
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
