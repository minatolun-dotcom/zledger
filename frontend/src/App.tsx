import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { useHeartbeat } from "./hooks/useHeartbeat";
import { usePageAccelerators } from "./hooks/usePageAccelerators";
import ToastContainer from "./components/ToastContainer";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import KeyboardHelp from "./components/KeyboardHelp";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import CompanySelectPage from "./pages/CompanySelectPage";
import DashboardPage from "./pages/DashboardPage";
import VouchersPage from "./pages/vouchers";

import ReportsPage from "./pages/ReportsPage";
import BusinessIntelligencePage from "./pages/reports/BusinessIntelligencePage";
import AgingAnalysisPage from "./pages/reports/AgingAnalysisPage";
import OutstandingBillsReport from "./pages/reports/OutstandingBillsReport";
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
import PartiesPage from "./pages/PartiesPage";
import BatchBrowsePage from "./pages/BatchBrowsePage";
import TallyImportPage from "./pages/TallyImportPage";
import RecurringTemplatesPage from "./pages/RecurringTemplatesPage";
import PaymentsPage from "./pages/PaymentsPage";
import ManufacturingPage from "./pages/ManufacturingPage";
import GstPage from "./pages/GstPage";
import FixedAssetsPage from "./pages/FixedAssetsPage";
import LoansPage from "./pages/LoansPage";
import CompliancePage from "./pages/CompliancePage";
import ModuleGate from "./components/ModuleGate";

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
  const companies = useAuthStore((s) => s.companies);
  const activeCompanyId = useAuthStore((s) => s.activeCompanyId);
  const meLoaded = useAuthStore((s) => s.meLoaded);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  // Send periodic heartbeats to track active users per company
  useHeartbeat();
  usePageAccelerators();

  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    function handler() { setHelpOpen((o) => !o); }
    window.addEventListener("toggle-help", handler);
    return () => window.removeEventListener("toggle-help", handler);
  }, []);

  // "?" also toggles help (skipped while typing in a field)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "?" || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      setHelpOpen((o) => !o);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (token && !user) {
      fetchMe();
    }
  }, [token, user, fetchMe]);

  // If authenticated but no valid active company is selected, send the user
  // to the company picker instead of rendering the app shell with no
  // X-Company-Id (which would error on every company-scoped call).
  const hasValidCompany =
    !!activeCompanyId && companies.some((c) => c.id === activeCompanyId);
  const needsCompany = token && meLoaded && !hasValidCompany;

  return (
    <>
    <ToastContainer />
    <ConfirmDialog />
    <ErrorBoundary>
    <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    <Routes>
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
      <Route path="/companies" element={<ProtectedRoute><CompanySelectPage /></ProtectedRoute>} />
      {needsCompany ? (
        <Route path="/*" element={<Navigate to="/companies" replace />} />
      ) : (
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}>
          <Route index element={<DashboardContent />} />
          <Route path="chart-of-accounts" element={<ChartOfAccountsPage />} />
          <Route path="parties" element={<PartiesPage />} />
          <Route path="vouchers" element={<VouchersPage />} />
          <Route path="voucher-register" element={<Navigate to="/vouchers?tab=browse" replace />} />
          <Route path="reports/aging-analysis" element={<AgingAnalysisPage />} />
          <Route path="reports/outstanding-bills" element={<OutstandingBillsReport />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/business-intelligence" element={<BusinessIntelligencePage />} />
          <Route path="daybook" element={<Navigate to="/vouchers?tab=daybook" replace />} />
          <Route path="vouchers/:id" element={<VouchersPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="bank-reconciliation" element={<ModuleGate route="bank-reconciliation"><BankReconciliationPage /></ModuleGate>} />
          <Route path="tds-tcs" element={<ModuleGate route="tds-tcs"><TdsTcsPage /></ModuleGate>} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="admin/users" element={<AdminUsersPage />} />
          <Route path="admin/companies" element={<AdminCompaniesPage />} />
          <Route path="admin/backups" element={<AdminBackupPage />} />
          <Route path="admin/activity" element={<AdminActivityPage />} />
          <Route path="company-settings" element={<CompanySettingsPage />} />
          <Route path="inventory" element={<ModuleGate route="inventory"><InventoryPage /></ModuleGate>} />
          <Route path="tally-import" element={<ModuleGate route="tally-import"><TallyImportPage /></ModuleGate>} />
          <Route path="recurring-templates" element={<RecurringTemplatesPage />} />
          <Route path="payments" element={<ModuleGate route="payments"><PaymentsPage /></ModuleGate>} />
          <Route path="gst" element={<ModuleGate route="gst"><GstPage /></ModuleGate>} />
          <Route path="manufacturing" element={<ModuleGate route="manufacturing"><ManufacturingPage /></ModuleGate>} />
          <Route path="fixed-assets" element={<ModuleGate route="fixed-assets"><FixedAssetsPage /></ModuleGate>} />
          <Route path="batches" element={<ModuleGate route="batches"><BatchBrowsePage /></ModuleGate>} />
          <Route path="loans" element={<ModuleGate route="loans"><LoansPage /></ModuleGate>} />
          <Route path="compliance" element={<ModuleGate route="compliance"><CompliancePage /></ModuleGate>} />
        </Route>
      )}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
    </>
  );
}
