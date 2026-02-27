import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import PageTitle from "./components/PageTitle";
import FaviconUpdater from "./components/FaviconUpdater";
import MetaTagsUpdater from "./components/MetaTagsUpdater";
import { Loader2 } from "lucide-react";

// Lazy load all page components for code splitting
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const StudioGradePage = lazy(() => import("./pages/StudioGrade"));
const StudioGradeStatic = lazy(() => import("./pages/reference/StudioGradeStatic"));
const StudiosCatalog = lazy(() => import("./pages/StudiosCatalog"));
const ContractDetail = lazy(() => import("./pages/ContractDetail"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminLogin = lazy(() => import("./pages/admin/Login"));
const AdminRequestPasswordReset = lazy(() => import("./pages/admin/RequestPasswordReset"));
const AdminResetPassword = lazy(() => import("./pages/admin/ResetPassword"));
const AdminContracts = lazy(() => import("./pages/admin/Contracts"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminSecrets = lazy(() => import("./pages/admin/Secrets"));
const AdminBranding = lazy(() => import("./pages/admin/Branding"));
const AdminAcademicYears = lazy(() => import("./pages/admin/AcademicYears"));
const AdminDocuSignTemplates = lazy(() => import("./pages/admin/DocuSignTemplates"));
const AdminStudioGrades = lazy(() => import("./pages/admin/StudioGrades"));
const AdminStudios = lazy(() => import("./pages/admin/Studios"));
const AdminApplications = lazy(() => import("./pages/admin/Applications"));
const AdminPaymentPlans = lazy(() => import("./pages/admin/PaymentPlans"));
const AdminFinancialForecast = lazy(() => import("./pages/admin/FinancialForecast"));
const AdminStudents = lazy(() => import("./pages/admin/Students"));
const AdminStudentDetail = lazy(() => import("./pages/admin/StudentDetail"));
const AdminReports = lazy(() => import("./pages/admin/Reports"));
const AdminAccountingReports = lazy(() => import("./pages/admin/AccountingReports"));
const AdminBookingCalendar = lazy(() => import("./pages/admin/BookingCalendar"));
const AdminBulkMessages = lazy(() => import("./pages/admin/BulkMessages"));
const AdminBulkInvitations = lazy(() => import("./pages/admin/BulkInvitations"));
const AdminTargetedMessages = lazy(() => import("./pages/admin/TargetedMessages"));
const AdminEmailTemplates = lazy(() => import("./pages/admin/EmailTemplates"));
const AdminApplicationDetail = lazy(() => import("./pages/admin/ApplicationDetail"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminPermissions = lazy(() => import("./pages/admin/Permissions"));
const AdminRefunds = lazy(() => import("./pages/admin/Refunds"));
const MaintenanceDashboard = lazy(() => import("./pages/admin/MaintenanceDashboard"));
const OutOfOrderPage = lazy(() => import("./pages/admin/OutOfOrderPage"));
const MaintenanceJobManagementPage = lazy(() => import("./pages/admin/MaintenanceJobManagementPage"));
const HousekeepingDashboard = lazy(() => import("./pages/admin/HousekeepingDashboard"));
const HousekeepingRosterPage = lazy(() => import("./pages/admin/HousekeepingRosterPage"));
const CommunalAreaHousekeepingDashboard = lazy(() => import("./pages/admin/CommunalAreaHousekeepingDashboard"));
const OTABookingsDashboard = lazy(() => import("./pages/admin/OTABookingsDashboard"));
const OTABookingChartPage = lazy(() => import("./pages/admin/OTABookingChartPage"));
const OTAFinancePage = lazy(() => import("./pages/admin/OTAFinancePage"));
const OTAStudioAllocationPage = lazy(() => import("./pages/admin/OTAStudioAllocationPage"));
const OTAReports = lazy(() => import("./pages/admin/OTAReports"));
const AdminExpenses = lazy(() => import("./pages/admin/Expenses"));
const AdminAuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const AdminPaymentHistory = lazy(() => import("./pages/admin/PaymentHistory"));
const AdminFullyPaidStudents = lazy(() => import("./pages/admin/FullyPaidStudents"));
const AdminCashbackCampaigns = lazy(() => import("./pages/admin/CashbackCampaigns"));
const AdminDiscountCampaigns = lazy(() => import("./pages/admin/DiscountCampaigns"));
const AdminPartners = lazy(() => import("./pages/admin/Partners"));
const AdminPartnerCommissions = lazy(() => import("./pages/admin/PartnerCommissions"));
const AdminWeeklyPaymentReport = lazy(() => import("./pages/admin/WeeklyPaymentReport"));
const AdminSalesReports = lazy(() => import("./pages/admin/SalesReports"));
const AdminDataImport = lazy(() => import("./pages/admin/DataImport"));
const AdminManualPaymentEntry = lazy(() => import("./pages/admin/ManualPaymentEntry"));
const PartnerLogin = lazy(() => import("./pages/partner/Login"));
const PartnerRegister = lazy(() => import("./pages/partner/Register"));
const PartnerResetPassword = lazy(() => import("./pages/partner/ResetPassword"));
const RequestPasswordReset = lazy(() => import("./pages/partner/RequestPasswordReset"));
const PartnerDashboard = lazy(() => import("./pages/partner/Dashboard"));
const PartnerReferrals = lazy(() => import("./pages/partner/Referrals"));
const PartnerCommissions = lazy(() => import("./pages/partner/Commissions"));
const PartnerProfile = lazy(() => import("./pages/partner/Profile"));
const StudentApplicationWizard = lazy(() => import("./pages/portal/ApplicationWizard"));
const StudentApplicationWizardPrototype = lazy(() => import("./pages/portal/ApplicationWizardPrototype"));
const PortalAuth = lazy(() => import("./pages/portal/Auth"));
const PortalRequestPasswordReset = lazy(() => import("./pages/portal/RequestPasswordReset"));
const PortalResetPassword = lazy(() => import("./pages/portal/ResetPassword"));
const PortalDashboard = lazy(() => import("./pages/portal/Dashboard"));
const StudioSelection = lazy(() => import("./pages/portal/StudioSelection"));
const PortalPayments = lazy(() => import("./pages/portal/Payments"));
const PortalContracts = lazy(() => import("./pages/portal/Contracts"));
const PortalDocuments = lazy(() => import("./pages/portal/Documents"));
const PortalProfile = lazy(() => import("./pages/portal/Profile"));
const PortalNotifications = lazy(() => import("./pages/portal/Notifications"));
const PortalMaintenance = lazy(() => import("./pages/portal/Maintenance"));
const DocuSignConsentCallback = lazy(() => import("./pages/DocuSignConsentCallback"));

// Loading fallback component
const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

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
              <Suspense fallback={<PageLoader />}>
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
                      <ProtectedRoute allowedRoles={["student", "staff", "superadmin", "operations_manager", "reservationist", "accountant", "front_desk", "maintenance_officer", "housekeeper"]}>
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
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "reservationist", "accountant", "front_desk", "maintenance_officer", "housekeeper"]}>
                  <AdminApplications />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/applications/:applicationId"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "reservationist", "accountant", "front_desk", "maintenance_officer", "housekeeper"]}>
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
            {/* Operations Module: Maintenance */}
            <Route
              path="/maintenance"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "maintenance_officer"]}>
                  <MaintenanceDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/maintenance/out-of-order"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "maintenance_officer"]}>
                  <OutOfOrderPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/maintenance/job-management"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "maintenance_officer"]}>
                  <MaintenanceJobManagementPage />
                </ProtectedRoute>
              }
            />
            {/* Operations Module: Housekeeping */}
            <Route
              path="/housekeeping"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "housekeeper"]}>
                  <HousekeepingDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/housekeeping/roster"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "housekeeper"]}>
                  <HousekeepingRosterPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/housekeeping/communal-areas"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "housekeeper"]}>
                  <CommunalAreaHousekeepingDashboard />
                </ProtectedRoute>
              }
            />
            {/* Operations Module: OTA Bookings */}
            <Route
              path="/ota-bookings"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "reservationist"]}>
                  <OTABookingsDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ota-bookings/booking-chart"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "reservationist"]}>
                  <OTABookingChartPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ota-bookings/studio-allocation"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "reservationist"]}>
                  <OTAStudioAllocationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ota-bookings/finance"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "reservationist"]}>
                  <OTAFinancePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ota-bookings/reports"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin", "operations_manager", "reservationist"]}>
                  <OTAReports />
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
              path="/admin/sales-reports"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminSalesReports />
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
              path="/admin/secrets"
              element={
                <ProtectedRoute allowedRoles={["superadmin"]}>
                  <AdminSecrets />
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
              path="/admin/discount-campaigns"
              element={
                <ProtectedRoute allowedRoles={["staff", "superadmin"]}>
                  <AdminDiscountCampaigns />
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
                <ProtectedRoute allowedRoles={["student", "staff", "superadmin", "operations_manager", "reservationist", "accountant", "front_desk", "maintenance_officer", "housekeeper"]}>
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

            {/* DocuSign JWT consent redirect – no 404 after granting consent */}
            <Route path="/api/docusign/oauth/callback" element={<DocuSignConsentCallback />} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
