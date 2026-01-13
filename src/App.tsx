import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { ProtectedFeatureRoute } from "@/components/layout/ProtectedFeatureRoute";
import { PageTitle } from "@/components/PageTitle";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import PublicMenu from "./pages/PublicMenu";
import AdminCompanies from "./pages/admin/AdminCompanies";
import AdminPlans from "./pages/admin/AdminPlans";
import AdminLogs from "./pages/admin/AdminLogs";
import IntegrationHealth from "./pages/admin/IntegrationHealth";
import OnboardingConfig from "./pages/admin/OnboardingConfig";
import AdminReferrals from "./pages/admin/AdminReferrals";
import NfeSettings from "./pages/admin/NfeSettings";
import AdminFeatures from "./pages/admin/AdminFeatures";
import SystemSettings from "./pages/admin/SystemSettings";
import DevDocs from "./pages/admin/DevDocs";
import ReleaseNotes from "./pages/admin/ReleaseNotes";
import EmailTemplates from "./pages/admin/EmailTemplates";
import NfeManagement from "./pages/store/NfeManagement";
import NfeSetup from "./pages/store/NfeSetup";
import StoreSettings from "./pages/store/StoreSettings";
import MenuManagement from "./pages/store/MenuManagement";
import OrdersManagement from "./pages/store/OrdersManagement";
import ManualOrderPOS from "./pages/store/ManualOrderPOS";
import TablesManagement from "./pages/store/TablesManagement";
import DriversManagement from "./pages/store/DriversManagement";
import CouponsManagement from "./pages/store/CouponsManagement";
import PromotionsManagement from "./pages/store/PromotionsManagement";
import ReviewsManagement from "./pages/store/ReviewsManagement";
import UserSettings from "./pages/store/UserSettings";
import PlansPage from "./pages/store/PlansPage";
import InventoryManagement from "./pages/store/InventoryManagement";
import ActivityLogs from "./pages/store/ActivityLogs";
import HelpWiki from "./pages/store/HelpWiki";
import KitchenDisplay from "./pages/store/KitchenDisplay";
import StaffManagement from "./pages/store/StaffManagement";
import CustomerReferrals from "./pages/store/CustomerReferrals";
import LotteryManagement from "./pages/store/LotteryManagement";
import CardTransactions from "./pages/store/CardTransactions";
import AdminCardTransactions from "./pages/admin/AdminCardTransactions";
import MyOrders from "./pages/MyOrders";
import OrderTracking from "./pages/OrderTracking";
import OrderHistory from "./pages/OrderHistory";
import DriverLogin from "./pages/DriverLogin";
import DriverDashboard from "./pages/DriverDashboard";
import SuperAdminSetup from "./pages/SuperAdminSetup";
import StaffLogin from "./pages/StaffLogin";
import NotFound from "./pages/NotFound";
import NotificationSoundSettings from "./pages/store/NotificationSoundSettings";
import NotificationsCenter from "./pages/store/NotificationsCenter";
import PromotionalNotifications from "./pages/store/PromotionalNotifications";
import ShareRedirect from "./pages/ShareRedirect";
import EmailSignature from "./pages/EmailSignature";
import PublicKDS from "./pages/PublicKDS";
import TermsOfUse from "./pages/TermsOfUse";
import PrivacyPolicy from "./pages/PrivacyPolicy";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Show cached data immediately, refetch in background
      staleTime: 1000 * 60 * 2, // Data is fresh for 2 minutes
      gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      refetchOnReconnect: true, // Refetch on network reconnect
      retry: 2, // Retry failed requests twice
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <PageTitle>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/menu/:slug" element={<PublicMenu />} />
              <Route path="/s/:slug" element={<ShareRedirect />} />
              <Route path="/my-orders" element={<MyOrders />} />
              <Route path="/track/:orderId" element={<OrderTracking />} />
              <Route path="/orders" element={<OrderHistory />} />
              <Route path="/email-signature" element={<EmailSignature />} />
              <Route path="/kds/:token" element={<PublicKDS />} />
              <Route path="/termos" element={<TermsOfUse />} />
              <Route path="/privacidade" element={<PrivacyPolicy />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/store"
                element={
                  <ProtectedRoute>
                    <StoreSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/menu"
                element={
                  <ProtectedRoute>
                    <MenuManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/orders"
                element={
                  <ProtectedRoute>
                    <OrdersManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/kds"
                element={
                  <ProtectedRoute>
                    <KitchenDisplay />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/orders/new"
                element={
                  <ProtectedRoute>
                    <ManualOrderPOS />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/pos"
                element={
                  <ProtectedRoute>
                    <ProtectedFeatureRoute featureKey="pos">
                      <ManualOrderPOS />
                    </ProtectedFeatureRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/tables"
                element={
                  <ProtectedRoute>
                    <ProtectedFeatureRoute featureKey="tables">
                      <TablesManagement />
                    </ProtectedFeatureRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/inventory"
                element={
                  <ProtectedRoute>
                    <InventoryManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/drivers"
                element={
                  <ProtectedRoute>
                    <ProtectedFeatureRoute featureKey="drivers">
                      <DriversManagement />
                    </ProtectedFeatureRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/coupons"
                element={
                  <ProtectedRoute>
                    <ProtectedFeatureRoute featureKey="coupons">
                      <CouponsManagement />
                    </ProtectedFeatureRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/promotions"
                element={
                  <ProtectedRoute>
                    <ProtectedFeatureRoute featureKey="promotions">
                      <PromotionsManagement />
                    </ProtectedFeatureRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/reviews"
                element={
                  <ProtectedRoute>
                    <ProtectedFeatureRoute featureKey="reviews">
                      <ReviewsManagement />
                    </ProtectedFeatureRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/settings"
                element={
                  <ProtectedRoute>
                    <UserSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/staff"
                element={
                  <ProtectedRoute requiredRoles={["store_owner"]}>
                    <ProtectedFeatureRoute featureKey="staff">
                      <StaffManagement />
                    </ProtectedFeatureRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                 path="/dashboard/plans"
                 element={
                   <ProtectedRoute>
                     <PlansPage />
                   </ProtectedRoute>
                 }
               />
               <Route
                 path="/dashboard/notifications/sounds"
                 element={
                   <ProtectedRoute>
                     <NotificationSoundSettings />
                   </ProtectedRoute>
                 }
               />
               <Route
                 path="/dashboard/notifications"
                 element={
                   <ProtectedRoute>
                     <NotificationsCenter />
                   </ProtectedRoute>
                 }
               />
               <Route
                 path="/dashboard/notifications/promotional"
                 element={
                   <ProtectedRoute>
                     <ProtectedFeatureRoute featureKey="push_notifications">
                       <PromotionalNotifications />
                     </ProtectedFeatureRoute>
                   </ProtectedRoute>
                 }
               />
               <Route
                 path="/dashboard/referrals"
                element={
                  <ProtectedRoute>
                    <ProtectedFeatureRoute featureKey="referrals">
                      <CustomerReferrals />
                    </ProtectedFeatureRoute>
                   </ProtectedRoute>
                 }
                />
                <Route
                  path="/dashboard/lottery"
                  element={
                    <ProtectedRoute>
                      <LotteryManagement />
                    </ProtectedRoute>
                  }
                 />
              <Route
                path="/dashboard/card-transactions"
                element={
                  <ProtectedRoute>
                    <CardTransactions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/nfe"
                element={
                  <ProtectedRoute>
                    <ProtectedFeatureRoute featureKey="nfe">
                      <NfeManagement />
                    </ProtectedFeatureRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/nfe/setup"
                element={
                  <ProtectedRoute>
                    <ProtectedFeatureRoute featureKey="nfe">
                      <NfeSetup />
                    </ProtectedFeatureRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/help"
                element={
                  <ProtectedRoute>
                    <HelpWiki />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/logs"
                element={
                  <ProtectedRoute>
                    <ProtectedFeatureRoute featureKey="activity_logs">
                      <ActivityLogs />
                    </ProtectedFeatureRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/companies"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <AdminCompanies />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/plans"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <AdminPlans />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/logs"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <AdminLogs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/onboarding"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <OnboardingConfig />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/referrals"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <AdminReferrals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/nfe"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <NfeSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/features"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <AdminFeatures />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/system"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <SystemSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/integrations"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <IntegrationHealth />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/card-transactions"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <AdminCardTransactions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/docs"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <DevDocs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/release-notes"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <ReleaseNotes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/email-templates"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <EmailTemplates />
                  </ProtectedRoute>
                }
              />
              <Route path="/driver/login" element={<DriverLogin />} />
              <Route path="/driver/login/:companySlug" element={<DriverLogin />} />
              <Route path="/staff/login" element={<StaffLogin />} />
              <Route
                path="/driver"
                element={
                  <ProtectedRoute>
                    <DriverDashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="/super-admin-setup" element={<SuperAdminSetup />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PageTitle>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
