import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { StoreProvider } from "@/contexts/StoreContext";
import { StaffProvider } from "@/contexts/StaffContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { PlansConfigProvider } from "@/contexts/PlansConfigContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import OfflineBanner from "@/components/OfflineBanner";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import { OfflineChatDrainer } from "@/components/OfflineChatDrainer";
import ScrollProgress from "@/components/ScrollProgress";
import PermissionGuard from "@/components/PermissionGuard";
import FeatureGate from "@/components/FeatureGate";
import type { FeatureKey } from "@/hooks/useStorePlan";
import { lazyPage } from "@/lib/lazyPage";
import { prefetchCriticalRoutes } from "@/lib/routePrefetch";
import { toast } from "sonner";
import { useEffect } from "react";

// ─── Keep public/auth pages lazy so logged-in dashboards don't load marketing code ───
import NotFound from "./pages/NotFound";

// ─── Lazy-loaded pages ───
const LandingPage = lazyPage(() => import("./pages/LandingPage"));
const Auth = lazyPage(() => import("./pages/Auth"));
const Onboarding = lazyPage(() => import("./pages/Onboarding"));
const Dashboard = lazyPage(() => import("./pages/Dashboard"));
const Products = lazyPage(() => import("./pages/Products"));
const OrderForms = lazyPage(() => import("./pages/OrderForms"));
const Coupons = lazyPage(() => import("./pages/Coupons"));
const Customers = lazyPage(() => import("./pages/Customers"));
const Orders = lazyPage(() => import("./pages/Orders"));
const PendingOrders = lazyPage(() => import("./pages/PendingOrders"));
const Transactions = lazyPage(() => import("./pages/Transactions"));
const Subscriptions = lazyPage(() => import("./pages/Subscriptions"));
const NotificationsPage = lazyPage(() => import("./pages/NotificationsPage"));
const NotificationCenter = lazyPage(() => import("./pages/NotificationCenter"));
const WooCommercePage = lazyPage(() => import("./pages/WooCommercePage"));
const BotAutomation = lazyPage(() => import("./pages/BotAutomation"));
const WhatsAppPage = lazyPage(() => import("./pages/WhatsAppPage"));
const GoogleSheetsPage = lazyPage(() => import("./pages/GoogleSheetsPage"));
const POS = lazyPage(() => import("./pages/POS"));
const SalesProfit = lazyPage(() => import("./pages/SalesProfit"));
const IncomeExpense = lazyPage(() => import("./pages/IncomeExpense"));
const AccountBook = lazyPage(() => import("./pages/AccountBook"));
const DueBook = lazyPage(() => import("./pages/DueBook"));
const AdCosts = lazyPage(() => import("./pages/AdCosts"));
const FacebookAds = lazyPage(() => import("./pages/FacebookAds"));
const TaskMission = lazyPage(() => import("./pages/TaskMission"));
const Reports = lazyPage(() => import("./pages/Reports"));
const Referral = lazyPage(() => import("./pages/Referral"));
const MyPlan = lazyPage(() => import("./pages/MyPlan"));
const SupportPage = lazyPage(() => import("./pages/SupportPage"));
const StaffInbox = lazyPage(() => import("./pages/StaffInbox"));
const Suppliers = lazyPage(() => import("./pages/Suppliers"));
const OnlineSuppliersPurchases = lazyPage(() => import("./pages/OnlineSuppliersPurchases"));
const Inventory = lazyPage(() => import("./pages/Inventory"));
const ZinipaySuccess = lazyPage(() => import("./pages/payment/ZinipaySuccess"));
const ZinipayCancel = lazyPage(() => import("./pages/payment/ZinipayCancel"));
const Purchases = lazyPage(() => import("./pages/Purchases"));
const CashRegister = lazyPage(() => import("./pages/CashRegister"));
const CustomerCredits = lazyPage(() => import("./pages/CustomerCredits"));
const LoyaltyPoints = lazyPage(() => import("./pages/LoyaltyPoints"));
const DueCustomers = lazyPage(() => import("./pages/DueCustomers"));
const StockAlerts = lazyPage(() => import("./pages/StockAlerts"));
const DailySalesReport = lazyPage(() => import("./pages/DailySalesReport"));
const OfflineProfitLoss = lazyPage(() => import("./pages/OfflineProfitLoss"));
const StaffPerformance = lazyPage(() => import("./pages/StaffPerformance"));
const SettingsPage = lazyPage(() => import("./pages/SettingsPage"));
const ResetPassword = lazyPage(() => import("./pages/ResetPassword"));
const PublicOrderForm = lazyPage(() => import("./pages/PublicOrderForm"));
const PublicInvoice = lazyPage(() => import("./pages/PublicInvoice"));
const FacebookCallback = lazyPage(() => import("./pages/FacebookCallback"));
const Integrations = lazyPage(() => import("./pages/Integrations"));
const AppEntry = lazyPage(() => import("./pages/AppEntry"));

// Admin pages (lazy)
const AdminLogin = lazyPage(() => import("./pages/admin/AdminLogin"));
const AdminBlocked = lazyPage(() => import("./pages/admin/AdminBlocked"));
const AdminLayout = lazyPage(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazyPage(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazyPage(() => import("./pages/admin/AdminUsers"));
const AdminHierarchy = lazyPage(() => import("./pages/admin/AdminHierarchy"));
const AdminStores = lazyPage(() => import("./pages/admin/AdminStores"));
const AdminReports = lazyPage(() => import("./pages/admin/AdminReports"));
const AdminSettings = lazyPage(() => import("./pages/admin/AdminSettings"));
const AdminCoupons = lazyPage(() => import("./pages/admin/AdminCoupons"));
const AdminStoreDetails = lazyPage(() => import("./pages/admin/AdminStoreDetails"));
const AdminUserDetails = lazyPage(() => import("./pages/admin/AdminUserDetails"));
const AdminPayments = lazyPage(() => import("./pages/admin/AdminPayments"));
const AdminPaymentGateways = lazyPage(() => import("./pages/admin/AdminPaymentGateways"));
const AdminAutoPayments = lazyPage(() => import("./pages/admin/AdminAutoPayments"));
const AdminLandingEditor = lazyPage(() => import("./pages/admin/AdminLandingEditor"));
const AdminInbox = lazyPage(() => import("./pages/admin/AdminInbox"));
const AdminSupportTickets = lazyPage(() => import("./pages/admin/AdminSupportTickets"));
const AdminReferrals = lazyPage(() => import("./pages/admin/AdminReferrals"));
const AdminPlansPricing = lazyPage(() => import("./pages/admin/AdminPlansPricing"));
const AdminAuditLogs = lazyPage(() => import("./pages/admin/AdminAuditLogs"));
const AdminBroadcasts = lazyPage(() => import("./pages/admin/AdminBroadcasts"));
const AdminMaintenance = lazyPage(() => import("./pages/admin/AdminMaintenance"));
const AdminRoles = lazyPage(() => import("./pages/admin/AdminRoles"));
const AdminDataExport = lazyPage(() => import("./pages/admin/AdminDataExport"));
const AdminLiveActivity = lazyPage(() => import("./pages/admin/AdminLiveActivity"));
const AdminFeatureFlags = lazyPage(() => import("./pages/admin/AdminFeatureFlags"));
const AdminTemplates = lazyPage(() => import("./pages/admin/AdminTemplates"));
const AdminFinance = lazyPage(() => import("./pages/admin/AdminFinance"));

// ─── QueryClient with aggressive caching for instant navigation ───
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
      staleTime: 5 * 60_000,     // 5 min stale — show cached instantly, background refresh
      gcTime: 30 * 60_000,       // 30 min cache — keep data warm
      refetchOnReconnect: "always",
      refetchOnWindowFocus: false, // Don't refetch on focus — kills perceived speed
      refetchOnMount: false,       // Use cached data instantly; realtime channels keep it fresh
      networkMode: "online",
    },
    mutations: {
      retry: 1,
      networkMode: "online",
      onError: (error) => {
        const msg = error instanceof Error ? error.message : "Something went wrong";
        toast.error("Action failed", { description: msg });
      },
    },
  },
});

// Sync online manager with browser
onlineManager.setEventListener((setOnline) => {
  const onlineHandler = () => setOnline(true);
  const offlineHandler = () => setOnline(false);
  window.addEventListener("online", onlineHandler);
  window.addEventListener("offline", offlineHandler);
  return () => {
    window.removeEventListener("online", onlineHandler);
    window.removeEventListener("offline", offlineHandler);
  };
});

/** Helper: ProtectedRoute + PermissionGuard */
const P = ({ children, perm, ownerOnly, feature }: { children: React.ReactNode; perm?: string | string[]; ownerOnly?: boolean; feature?: FeatureKey }) => (
  <ProtectedRoute>
    <PermissionGuard requiredPermission={perm} ownerOnly={ownerOnly}>
      {feature ? <FeatureGate feature={feature}>{children}</FeatureGate> : children}
    </PermissionGuard>
  </ProtectedRoute>
);

const App = () => {
  useEffect(() => {
    prefetchCriticalRoutes();
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <LanguageProvider>
    <StoreProvider>
    <StaffProvider>
    <CurrencyProvider>
    <PlansConfigProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <OfflineBanner />
        <MaintenanceBanner />
        <OfflineChatDrainer />
        <ScrollProgress />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/app" element={<AppEntry />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/f/:slug" element={<PublicOrderForm />} />
            <Route path="/i/:id" element={<PublicInvoice />} />
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
            <Route path="/finance/account-book" element={<P perm="reports.view" feature="reports"><AccountBook /></P>} />
            <Route path="/finance/due-book" element={<P perm="reports.view" feature="due_book"><DueBook /></P>} />
            <Route path="/finance/ad-costs" element={<P perm="reports.view" feature="ad_costs"><AdCosts /></P>} />
            <Route path="/finance/facebook-ads" element={<Navigate to="/integrations/facebook-ads" replace />} />
            <Route path="/integrations/facebook-ads" element={<P perm="reports.view" feature="ad_costs"><FacebookAds /></P>} />
            <Route path="/finance/tasks" element={<P perm="orders.view" feature="task_mission"><TaskMission /></P>} />
            <Route path="/reports" element={<P perm="reports.view" feature="reports"><Reports /></P>} />
            <Route path="/referral" element={<P ownerOnly feature="referral"><Referral /></P>} />
            <Route path="/my-plan" element={<P ownerOnly><MyPlan /></P>} />
            <Route path="/payment/zinipay/success" element={<P ownerOnly><ZinipaySuccess /></P>} />
            <Route path="/payment/zinipay/cancel" element={<P ownerOnly><ZinipayCancel /></P>} />
            <Route path="/support" element={<P><SupportPage /></P>} />
            <Route path="/staff-inbox" element={<P><StaffInbox /></P>} />
            <Route path="/settings" element={<P perm={["settings.view", "settings.edit"]}><SettingsPage /></P>} />
            <Route path="/notification-center" element={<P><NotificationCenter /></P>} />
            <Route path="/inventory" element={<P perm="products.view"><Inventory /></P>} />
            <Route path="/online/suppliers-purchases" element={<P perm="products.edit"><OnlineSuppliersPurchases /></P>} />
            <Route path="/offline/suppliers" element={<P perm="products.view"><Suppliers /></P>} />
            <Route path="/offline/purchases" element={<P perm="products.edit"><Purchases /></P>} />
            <Route path="/offline/cash-register" element={<P perm="pos.access"><CashRegister /></P>} />
            <Route path="/offline/customer-credits" element={<P perm="customers.view"><CustomerCredits /></P>} />
            <Route path="/offline/loyalty" element={<P perm="customers.view"><LoyaltyPoints /></P>} />
            <Route path="/offline/due-customers" element={<P perm="customers.view"><DueCustomers /></P>} />
            <Route path="/offline/stock-alerts" element={<P perm="products.view"><StockAlerts /></P>} />
            <Route path="/offline/daily-report" element={<P perm="reports.view"><DailySalesReport /></P>} />
            <Route path="/offline/profit-loss" element={<P perm="reports.view"><OfflineProfitLoss /></P>} />
            <Route path="/offline/staff-performance" element={<P perm="reports.view"><StaffPerformance /></P>} />

            {/* Admin login at /sanjoy */}
            <Route path="/sanjoy" element={<AdminLogin />} />

            {/* Admin route — blocked, no login */}
            <Route path="/admin" element={<AdminBlocked />} />

            {/* Admin Panel — protected routes */}
            <Route element={<AdminLayout />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/hierarchy" element={<AdminHierarchy />} />
              <Route path="/admin/stores" element={<AdminStores />} />
              <Route path="/admin/stores/:storeId" element={<AdminStoreDetails />} />
              <Route path="/admin/users/:userId" element={<AdminUserDetails />} />
              <Route path="/admin/payments" element={<AdminPayments />} />
              <Route path="/admin/gateways" element={<AdminPaymentGateways />} />
              <Route path="/admin/auto-payments" element={<AdminAutoPayments />} />
              <Route path="/admin/reports" element={<AdminReports />} />
              <Route path="/admin/coupons" element={<AdminCoupons />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/admin/landing" element={<AdminLandingEditor />} />
              <Route path="/admin/inbox" element={<AdminInbox />} />
              <Route path="/admin/support" element={<AdminSupportTickets />} />
              <Route path="/admin/referrals" element={<AdminReferrals />} />
              <Route path="/admin/plans-pricing" element={<AdminPlansPricing />} />
              <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
              <Route path="/admin/broadcasts" element={<AdminBroadcasts />} />
              <Route path="/admin/maintenance" element={<AdminMaintenance />} />
              <Route path="/admin/feature-flags" element={<AdminFeatureFlags />} />
              <Route path="/admin/templates" element={<AdminTemplates />} />
              <Route path="/admin/finance" element={<AdminFinance />} />
              <Route path="/admin/roles" element={<AdminRoles />} />
              <Route path="/admin/export" element={<AdminDataExport />} />
              <Route path="/admin/activity" element={<AdminLiveActivity />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </PlansConfigProvider>
    </CurrencyProvider>
    </StaffProvider>
    </StoreProvider>
    </LanguageProvider>
    </AuthProvider>
  </QueryClientProvider>
  );
};

export default App;
