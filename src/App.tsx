import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { StoreProvider } from "@/contexts/StoreContext";
import { StaffProvider } from "@/contexts/StaffContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import PermissionGuard from "@/components/PermissionGuard";
import FeatureGate from "@/components/FeatureGate";
import type { FeatureKey } from "@/hooks/useStorePlan";
import LandingPage from "./pages/LandingPage";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import OrderForms from "./pages/OrderForms";
import Coupons from "./pages/Coupons";
import Customers from "./pages/Customers";
import Orders from "./pages/Orders";
import PendingOrders from "./pages/PendingOrders";
import Transactions from "./pages/Transactions";
import Subscriptions from "./pages/Subscriptions";
import NotificationsPage from "./pages/NotificationsPage";
import NotificationCenter from "./pages/NotificationCenter";
import WooCommercePage from "./pages/WooCommercePage";
import BotAutomation from "./pages/BotAutomation";
import WhatsAppPage from "./pages/WhatsAppPage";
import GoogleSheetsPage from "./pages/GoogleSheetsPage";
import POS from "./pages/POS";
import SalesProfit from "./pages/SalesProfit";
import IncomeExpense from "./pages/IncomeExpense";
import DueBook from "./pages/DueBook";
import AdCosts from "./pages/AdCosts";
import FacebookAds from "./pages/FacebookAds";
import TaskMission from "./pages/TaskMission";
import Reports from "./pages/Reports";
import Referral from "./pages/Referral";
import MyPlan from "./pages/MyPlan";
import SupportPage from "./pages/SupportPage";
import StaffInbox from "./pages/StaffInbox";
import Suppliers from "./pages/Suppliers";
import Purchases from "./pages/Purchases";
import CashRegister from "./pages/CashRegister";
import CustomerCredits from "./pages/CustomerCredits";
import LoyaltyPoints from "./pages/LoyaltyPoints";
import StockAlerts from "./pages/StockAlerts";
import DailySalesReport from "./pages/DailySalesReport";
import OfflineProfitLoss from "./pages/OfflineProfitLoss";
import StaffPerformance from "./pages/StaffPerformance";

import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";

// Admin pages
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminStores from "./pages/admin/AdminStores";
import AdminReports from "./pages/admin/AdminReports";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminCoupons from "./pages/admin/AdminCoupons";
import AdminStoreDetails from "./pages/admin/AdminStoreDetails";
import AdminUserDetails from "./pages/admin/AdminUserDetails";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminPaymentGateways from "./pages/admin/AdminPaymentGateways";
import AdminAutoPayments from "./pages/admin/AdminAutoPayments";
import AdminLandingEditor from "./pages/admin/AdminLandingEditor";
import AdminInbox from "./pages/admin/AdminInbox";
import AdminSupportTickets from "./pages/admin/AdminSupportTickets";
import PublicOrderForm from "./pages/PublicOrderForm";
import FacebookCallback from "./pages/FacebookCallback";

const queryClient = new QueryClient();

/** Helper: ProtectedRoute + PermissionGuard */
const P = ({ children, perm, ownerOnly, feature }: { children: React.ReactNode; perm?: string | string[]; ownerOnly?: boolean; feature?: FeatureKey }) => (
  <ProtectedRoute>
    <PermissionGuard requiredPermission={perm} ownerOnly={ownerOnly}>
      {feature ? <FeatureGate feature={feature}>{children}</FeatureGate> : children}
    </PermissionGuard>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <LanguageProvider>
    <StoreProvider>
    <StaffProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/f/:slug" element={<PublicOrderForm />} />
            <Route path="/api/facebook/callback" element={<FacebookCallback />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<P><Dashboard /></P>} />
            <Route path="/products" element={<P perm="products.view"><Products /></P>} />
            <Route path="/order-forms" element={<P perm="products.view" feature="order_forms"><OrderForms /></P>} />
            <Route path="/coupons" element={<P perm="products.edit" feature="coupons"><Coupons /></P>} />
            <Route path="/customers" element={<P perm="customers.view"><Customers /></P>} />
            <Route path="/orders" element={<P perm={["orders.view", "orders.create"]}><Orders /></P>} />
            <Route path="/orders/pending" element={<P perm="orders.view"><PendingOrders /></P>} />
            <Route path="/transactions" element={<P perm="reports.view"><Transactions /></P>} />
            <Route path="/subscriptions" element={<P perm="customers.view" feature="subscriptions"><Subscriptions /></P>} />
            <Route path="/integrations" element={<Navigate to="/integrations/notifications" replace />} />
            <Route path="/integrations/notifications" element={<P><NotificationsPage /></P>} />
            <Route path="/integrations/woocommerce" element={<P perm="settings.edit" feature="woocommerce"><WooCommercePage /></P>} />
            <Route path="/integrations/bot-automation" element={<P perm="settings.edit" feature="bot_automation"><BotAutomation /></P>} />
            <Route path="/integrations/whatsapp" element={<P perm="settings.edit" feature="whatsapp"><WhatsAppPage /></P>} />
            <Route path="/integrations/google-sheets" element={<P perm="settings.edit" feature="google_sheets"><GoogleSheetsPage /></P>} />
            <Route path="/pos" element={<P perm="pos.access"><POS /></P>} />
            <Route path="/finance/sales-profit" element={<P perm="reports.view" feature="reports"><SalesProfit /></P>} />
            <Route path="/finance/income-expense" element={<P perm="reports.view" feature="reports"><IncomeExpense /></P>} />
            <Route path="/finance/due-book" element={<P perm="reports.view" feature="due_book"><DueBook /></P>} />
            <Route path="/finance/ad-costs" element={<P perm="reports.view" feature="ad_costs"><AdCosts /></P>} />
            <Route path="/finance/facebook-ads" element={<P perm="reports.view" feature="ad_costs"><FacebookAds /></P>} />
            <Route path="/finance/tasks" element={<P perm="orders.view" feature="task_mission"><TaskMission /></P>} />
            <Route path="/reports" element={<P perm="reports.view" feature="reports"><Reports /></P>} />
            <Route path="/referral" element={<P ownerOnly feature="referral"><Referral /></P>} />
            <Route path="/my-plan" element={<P ownerOnly><MyPlan /></P>} />
            <Route path="/support" element={<P><SupportPage /></P>} />
            <Route path="/staff-inbox" element={<P ownerOnly><StaffInbox /></P>} />
            <Route path="/settings" element={<P perm={["settings.view", "settings.edit"]}><SettingsPage /></P>} />
            <Route path="/notification-center" element={<P><NotificationCenter /></P>} />
            <Route path="/offline/suppliers" element={<P perm="products.view"><Suppliers /></P>} />
            <Route path="/offline/purchases" element={<P perm="products.edit"><Purchases /></P>} />
            <Route path="/offline/cash-register" element={<P perm="pos.access"><CashRegister /></P>} />
            <Route path="/offline/customer-credits" element={<P perm="customers.view"><CustomerCredits /></P>} />
            <Route path="/offline/loyalty" element={<P perm="customers.view"><LoyaltyPoints /></P>} />
            <Route path="/offline/stock-alerts" element={<P perm="products.view"><StockAlerts /></P>} />

            {/* Admin Panel — completely separate */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminLogin />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="stores" element={<AdminStores />} />
              <Route path="stores/:storeId" element={<AdminStoreDetails />} />
              <Route path="users/:userId" element={<AdminUserDetails />} />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="gateways" element={<AdminPaymentGateways />} />
              <Route path="auto-payments" element={<AdminAutoPayments />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="coupons" element={<AdminCoupons />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="landing" element={<AdminLandingEditor />} />
              <Route path="inbox" element={<AdminInbox />} />
              <Route path="support" element={<AdminSupportTickets />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </StaffProvider>
    </StoreProvider>
    </LanguageProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
