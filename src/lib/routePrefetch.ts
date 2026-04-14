/**
 * Route prefetch utility — preloads page chunks on hover/focus for instant navigation.
 * Also prefetches ALL routes during idle time for zero-delay navigation.
 */

const prefetchedRoutes = new Set<string>();

// Map route paths to their dynamic import factories
const routeImports: Record<string, () => Promise<any>> = {
  "/dashboard": () => import("@/pages/Dashboard"),
  "/pos": () => import("@/pages/POS"),
  "/orders": () => import("@/pages/Orders"),
  "/orders/pending": () => import("@/pages/PendingOrders"),
  "/products": () => import("@/pages/Products"),
  "/settings": () => import("@/pages/SettingsPage"),
  "/transactions": () => import("@/pages/Transactions"),
  "/reports": () => import("@/pages/Reports"),
  "/my-plan": () => import("@/pages/MyPlan"),
  "/support": () => import("@/pages/SupportPage"),
  "/subscriptions": () => import("@/pages/Subscriptions"),
  "/integrations/notifications": () => import("@/pages/NotificationsPage"),
  "/integrations/woocommerce": () => import("@/pages/WooCommercePage"),
  "/integrations/whatsapp": () => import("@/pages/WhatsAppPage"),
  "/integrations/bot-automation": () => import("@/pages/BotAutomation"),
  "/integrations/google-sheets": () => import("@/pages/GoogleSheetsPage"),
  "/integrations/facebook-ads": () => import("@/pages/FacebookAds"),
  "/finance/sales-profit": () => import("@/pages/SalesProfit"),
  "/finance/income-expense": () => import("@/pages/IncomeExpense"),
  "/finance/due-book": () => import("@/pages/DueBook"),
  "/finance/ad-costs": () => import("@/pages/AdCosts"),
  "/finance/tasks": () => import("@/pages/TaskMission"),
  "/referral": () => import("@/pages/Referral"),
  "/notification-center": () => import("@/pages/NotificationCenter"),
  "/customers": () => import("@/pages/Customers"),
  "/coupons": () => import("@/pages/Coupons"),
  "/order-forms": () => import("@/pages/OrderForms"),
  "/staff-inbox": () => import("@/pages/StaffInbox"),
  "/offline/suppliers": () => import("@/pages/Suppliers"),
  "/offline/purchases": () => import("@/pages/Purchases"),
  "/offline/cash-register": () => import("@/pages/CashRegister"),
  "/offline/customer-credits": () => import("@/pages/CustomerCredits"),
  "/offline/due-customers": () => import("@/pages/DueCustomers"),
  "/offline/daily-report": () => import("@/pages/DailySalesReport"),
  "/offline/profit-loss": () => import("@/pages/OfflineProfitLoss"),
  "/offline/stock-alerts": () => import("@/pages/StockAlerts"),
  "/offline/loyalty": () => import("@/pages/LoyaltyPoints"),
  "/offline/staff-performance": () => import("@/pages/StaffPerformance"),
  "/onboarding": () => import("@/pages/Onboarding"),
  // Admin
  "/admin": () => import("@/pages/admin/AdminLayout"),
  "/admin/dashboard": () => import("@/pages/admin/AdminDashboard"),
  "/admin/users": () => import("@/pages/admin/AdminUsers"),
  "/admin/stores": () => import("@/pages/admin/AdminStores"),
  "/admin/payments": () => import("@/pages/admin/AdminPayments"),
  "/admin/gateways": () => import("@/pages/admin/AdminPaymentGateways"),
  "/admin/auto-payments": () => import("@/pages/admin/AdminAutoPayments"),
  "/admin/reports": () => import("@/pages/admin/AdminReports"),
  "/admin/coupons": () => import("@/pages/admin/AdminCoupons"),
  "/admin/settings": () => import("@/pages/admin/AdminSettings"),
  "/admin/landing": () => import("@/pages/admin/AdminLandingEditor"),
  "/admin/inbox": () => import("@/pages/admin/AdminInbox"),
  "/admin/support": () => import("@/pages/admin/AdminSupportTickets"),
  "/admin/referrals": () => import("@/pages/admin/AdminReferrals"),
};

/** Prefetch a route's JS chunk (no-op if already done) */
export function prefetchRoute(path: string) {
  const cleanPath = path.split("?")[0];
  if (prefetchedRoutes.has(cleanPath)) return;
  const factory = routeImports[cleanPath];
  if (factory) {
    prefetchedRoutes.add(cleanPath);
    factory().catch(() => {
      prefetchedRoutes.delete(cleanPath);
    });
  }
}

/** Prefetch critical routes immediately, then ALL routes during idle */
export function prefetchCriticalRoutes() {
  // Phase 1: Critical routes — prefetch immediately (no delay)
  const critical = ["/dashboard", "/pos", "/orders", "/products", "/customers", "/settings"];
  critical.forEach(prefetchRoute);

  // Phase 2: Prefetch ALL remaining routes during idle time
  const schedule = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 300));
  schedule(() => {
    const remaining = Object.keys(routeImports).filter(r => !prefetchedRoutes.has(r));
    // Stagger to avoid network congestion
    remaining.forEach((route, i) => {
      setTimeout(() => prefetchRoute(route), i * 50);
    });
  });
}

/** Create hover/focus handlers for a link element */
export function createPrefetchHandlers(path: string) {
  return {
    onMouseEnter: () => prefetchRoute(path),
    onFocus: () => prefetchRoute(path),
  };
}
