import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { useHeartbeat } from "./hooks/useHeartbeat";
import ToastContainer from "./components/ToastContainer";
import { ConfirmDialog } from "./components/ConfirmDialog";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import CompanySelectPage from "./pages/CompanySelectPage";
import DashboardPage from "./pages/DashboardPage";
import HsnSacPage from "./pages/HsnSacPage";
import GstRegistrationsPage from "./pages/GstRegistrationsPage";
import VouchersPage from "./pages/vouchers";
import ReportsPage from "./pages/ReportsPage";
import CompliancePage from "./pages/CompliancePage";
import EInvoicePage from "./pages/EInvoicePage";
import EwayBillPage from "./pages/EwayBillPage";
import MembersPage from "./pages/MembersPage";
import ProfilePage from "./pages/ProfilePage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminCompaniesPage from "./pages/AdminCompaniesPage";
import AdminBackupPage from "./pages/AdminBackupPage";
import AdminActivityPage from "./pages/AdminActivityPage";
import DashboardContent from "./pages/DashboardContent";
import AuditLogPage from "./pages/AuditLogPage";
import BankReconciliationPage from "./pages/BankReconciliationPage";
import TdsTcsPage from "./pages/TdsTcsPage";
import CompanySettingsPage from "./pages/CompanySettingsPage";
import InventoryPage from "./pages/InventoryPage";
import ChartOfAccountsPage from "./pages/ChartOfAccountsPage";
import BatchTracePage from "./pages/BatchTracePage";
import BatchBrowsePage from "./pages/BatchBrowsePage";
import DayBookPage from "./pages/DayBookPage";
import FinancialYearsPage from "./pages/FinancialYearsPage";
import TallyImportPage from "./pages/TallyImportPage";
import RecurringTemplatesPage from "./pages/RecurringTemplatesPage";
import PaymentsPage from "./pages/PaymentsPage";
import ManufacturingPage from "./pages/ManufacturingPage";
import GstPage from "./pages/GstPage";
import ApprovalsPage from "./pages/ApprovalsPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/companies" replace />;
  return <>{children}</>;
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  // Send periodic heartbeats to track active users per company
  useHeartbeat();

  useEffect(() => {
    if (token && !user) {
      fetchMe();
    }
  }, [token, user, fetchMe]);

  return (
    <>
    <ToastContainer />
    <ConfirmDialog />
    <Routes>
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
      <Route path="/companies" element={<ProtectedRoute><CompanySelectPage /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}>
        <Route index element={<DashboardContent />} />
        <Route path="chart-of-accounts" element={<ChartOfAccountsPage />} />
        <Route path="gst/hsn-sac" element={<HsnSacPage />} />
        <Route path="gst/registrations" element={<GstRegistrationsPage />} />
        <Route path="vouchers" element={<VouchersPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="daybook" element={<DayBookPage />} />
        <Route path="vouchers/:id" element={<VouchersPage />} />
        <Route path="compliance" element={<CompliancePage />} />
        <Route path="einvoice" element={<EInvoicePage />} />
        <Route path="eway-bill" element={<EwayBillPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="bank-reconciliation" element={<BankReconciliationPage />} />
        <Route path="tds-tcs" element={<TdsTcsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="admin/users" element={<AdminUsersPage />} />
        <Route path="admin/companies" element={<AdminCompaniesPage />} />
        <Route path="admin/backups" element={<AdminBackupPage />} />
        <Route path="admin/activity" element={<AdminActivityPage />} />
        <Route path="company-settings" element={<CompanySettingsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="financial-years" element={<FinancialYearsPage />} />
        <Route path="tally-import" element={<TallyImportPage />} />
        <Route path="recurring-templates" element={<RecurringTemplatesPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="gst" element={<GstPage />} />
        <Route path="manufacturing" element={<ManufacturingPage />} />
        <Route path="batch-trace" element={<BatchTracePage />} />
        <Route path="batches" element={<BatchBrowsePage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
