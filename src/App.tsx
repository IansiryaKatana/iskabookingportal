import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import StudioGradePage from "./pages/StudioGrade";
import StudioGradeStatic from "./pages/reference/StudioGradeStatic";
import StudiosCatalog from "./pages/StudiosCatalog";
import ContractDetail from "./pages/ContractDetail";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminLogin from "./pages/admin/Login";
import AdminRequestPasswordReset from "./pages/admin/RequestPasswordReset";
import AdminResetPassword from "./pages/admin/ResetPassword";
import AdminContracts from "./pages/admin/Contracts";
import AdminSettings from "./pages/admin/Settings";
import AdminBranding from "./pages/admin/Branding";
import AdminAcademicYears from "./pages/admin/AcademicYears";
import AdminDocuSignTemplates from "./pages/admin/DocuSignTemplates";
import AdminStudioGrades from "./pages/admin/StudioGrades";
import AdminStudios from "./pages/admin/Studios";
import AdminApplications from "./pages/admin/Applications";
import AdminPaymentPlans from "./pages/admin/PaymentPlans";
import AdminFinancialForecast from "./pages/admin/FinancialForecast";
import AdminStudents from "./pages/admin/Students";
import AdminStudentDetail from "./pages/admin/StudentDetail";
import AdminReports from "./pages/admin/Reports";
import AdminAccountingReports from "./pages/admin/AccountingReports";
import AdminBookingCalendar from "./pages/admin/BookingCalendar";
import AdminBulkMessages from "./pages/admin/BulkMessages";
import AdminBulkInvitations from "./pages/admin/BulkInvitations";
import AdminTargetedMessages from "./pages/admin/TargetedMessages";
import AdminEmailTemplates from "./pages/admin/EmailTemplates";
import AdminApplicationDetail from "./pages/admin/ApplicationDetail";
import AdminUsers from "./pages/admin/Users";
import AdminPermissions from "./pages/admin/Permissions";
import AdminRefunds from "./pages/admin/Refunds";
import AdminMaintenance from "./pages/admin/Maintenance";
import AdminExpenses from "./pages/admin/Expenses";
import AdminAuditLogs from "./pages/admin/AuditLogs";
import AdminPaymentHistory from "./pages/admin/PaymentHistory";
import AdminFullyPaidStudents from "./pages/admin/FullyPaidStudents";
import AdminCashbackCampaigns from "./pages/admin/CashbackCampaigns";
import AdminPartners from "./pages/admin/Partners";
import AdminPartnerCommissions from "./pages/admin/PartnerCommissions";
import AdminWeeklyPaymentReport from "./pages/admin/WeeklyPaymentReport";
import AdminDataImport from "./pages/admin/DataImport";
import AdminManualPaymentEntry from "./pages/admin/ManualPaymentEntry";
import PartnerLogin from "./pages/partner/Login";
import PartnerRegister from "./pages/partner/Register";
import PartnerResetPassword from "./pages/partner/ResetPassword";
import RequestPasswordReset from "./pages/partner/RequestPasswordReset";
import PartnerDashboard from "./pages/partner/Dashboard";
import PartnerReferrals from "./pages/partner/Referrals";
import PartnerCommissions from "./pages/partner/Commissions";
import PartnerProfile from "./pages/partner/Profile";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import StudentApplicationWizard from "./pages/portal/ApplicationWizard";
import StudentApplicationWizardPrototype from "./pages/portal/ApplicationWizardPrototype";
import PortalAuth from "./pages/portal/Auth";
import PortalRequestPasswordReset from "./pages/portal/RequestPasswordReset";
import PortalResetPassword from "./pages/portal/ResetPassword";
import PortalDashboard from "./pages/portal/Dashboard";
import StudioSelection from "./pages/portal/StudioSelection";
import PortalPayments from "./pages/portal/Payments";
import PortalContracts from "./pages/portal/Contracts";
import PortalDocuments from "./pages/portal/Documents";
import PortalProfile from "./pages/portal/Profile";
import PortalNotifications from "./pages/portal/Notifications";
import PortalMaintenance from "./pages/portal/Maintenance";
import PageTitle from "./components/PageTitle";
import FaviconUpdater from "./components/FaviconUpdater";
import MetaTagsUpdater from "./components/MetaTagsUpdater";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <ErrorBoundary>
              <PageTitle />
              <FaviconUpdater />
              <MetaTagsUpdater />
              <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/studios" element={<StudiosCatalog />} />
            <Route path="/studios/:year" element={<StudiosCatalog />} />
            <Route path="/studios/:year/:slug" element={<StudioGradePage />} />
            <Route path="/studios/:slug" element={<StudioGradePage />} />
            <Route path="/contracts/*" element={<ContractDetail />} />
            <Route path="/reference/studio-grade-static" element={<StudioGradeStatic />} />
            <Route path="/portal/login" element={<PortalAuth />} />
            <Route path="/portal/request-password-reset" element={<PortalRequestPasswordReset />} />
            <Route path="/portal/reset-password" element={<PortalResetPassword />} />
                  <Route path="/portal/reset-password" element={<PortalResetPassword />} />
                  <Route
                    path="/portal"
                    element={
                      <ProtectedRoute allowedRoles={["student", "superadmin"]}>
                        <PortalDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/portal/payments"
                    element={
                      <ProtectedRoute allowedRoles={["student", "superadmin"]}>
                        <PortalPayments />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/portal/contracts"
                    element={
                      <ProtectedRoute allowedRoles={["student", "superadmin"]}>
                        <PortalContracts />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/portal/documents"
                    element={
                      <ProtectedRoute allowedRoles={["student", "superadmin"]}>
                        <PortalDocuments />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/portal/notifications"
                    element={
                      <ProtectedRoute allowedRoles={["student", "superadmin"]}>
                        <PortalNotifications />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/portal/maintenance"
                    element={
                      <ProtectedRoute allowedRoles={["student", "superadmin"]}>
                        <PortalMaintenance />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/portal/profile"
                    element={
                      <ProtectedRoute allowedRoles={["student", "superadmin"]}>
                        <PortalProfile />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/portal/applications/:applicationId/select-studio"
                    element={
                      <ProtectedRoute allowedRoles={["student", "superadmin"]}>
                        <StudioSelection />
                      </ProtectedRoute>
                    }
                  />

            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/request-password-reset" element={<AdminRequestPasswordReset />} />
            <Route path="/admin/reset-password" element={<AdminResetPassword />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/academic-years"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminAcademicYears />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/studio-grades"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminStudioGrades />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/payment-plans"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminPaymentPlans />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/contracts"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminContracts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/studios"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminStudios />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/applications"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminApplications />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/applications/:applicationId"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminApplicationDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/students"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminStudents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/maintenance"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminMaintenance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/students/:applicationId"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminStudentDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/reports"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminReports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/accounting-reports"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminAccountingReports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/booking-calendar"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminBookingCalendar />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/bulk-messages"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminBulkMessages />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/bulk-invitations"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminBulkInvitations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/targeted-messages"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminTargetedMessages />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/email-templates"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminEmailTemplates />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "admin"]}>
                  <AdminUsers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/permissions"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "admin"]}>
                  <AdminPermissions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/expenses"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminExpenses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/refunds"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminRefunds />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit-logs"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminAuditLogs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/branding"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminBranding />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/docusign-templates"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminDocuSignTemplates />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/financial-forecast"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminFinancialForecast />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/payment-history"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminPaymentHistory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/fully-paid-students"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminFullyPaidStudents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/cashback-campaigns"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminCashbackCampaigns />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/partners"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminPartners />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/partner-commissions"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminPartnerCommissions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/weekly-payment-report"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminWeeklyPaymentReport />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/data-import"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminDataImport />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/manual-payment-entry"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminManualPaymentEntry />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portal/applications/:applicationId"
              element={
                <ProtectedRoute allowedRoles={["student", "superadmin"]}>
                  <StudentApplicationWizard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portal/wizard-prototype/:applicationId?"
              element={
                <ProtectedRoute allowedRoles={["student", "superadmin"]}>
                  <StudentApplicationWizardPrototype />
                </ProtectedRoute>
              }
            />

            {/* Partner Portal Routes */}
            <Route path="/partner/login" element={<PartnerLogin />} />
            <Route path="/partner/register" element={<PartnerRegister />} />
            <Route path="/partner/request-password-reset" element={<RequestPasswordReset />} />
            <Route path="/partner/reset-password" element={<PartnerResetPassword />} />
            <Route
              path="/partner"
              element={
                <ProtectedRoute allowedRoles={["partner", "superadmin"]}>
                  <PartnerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/partner/referrals"
              element={
                <ProtectedRoute allowedRoles={["partner", "superadmin"]}>
                  <PartnerReferrals />
                </ProtectedRoute>
              }
            />
            <Route
              path="/partner/commissions"
              element={
                <ProtectedRoute allowedRoles={["partner", "superadmin"]}>
                  <PartnerCommissions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/partner/profile"
              element={
                <ProtectedRoute allowedRoles={["partner", "superadmin"]}>
                  <PartnerProfile />
                </ProtectedRoute>
              }
            />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
