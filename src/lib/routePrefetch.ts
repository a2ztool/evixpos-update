/**
 * Route prefetch utility — preloads page chunks on hover/focus for instant navigation.
 */

const prefetchedRoutes = new Set<string>();

// Map route paths to their dynamic import factories
const routeImports: Record<string, () => Promise<any>> = {
  "/dashboard": () => import("@/pages/Dashboard"),
  "/pos": () => import("@/pages/POS"),
  "/orders": () => import("@/pages/Orders"),
  "/products": () => import("@/pages/Products"),
  "/customers": () => import("@/pages/Customers"),
  "/settings": () => import("@/pages/SettingsPage"),
  "/transactions": () => import("@/pages/Transactions"),
  "/reports": () => import("@/pages/Reports"),
  "/my-plan": () => import("@/pages/MyPlan"),
  "/support": () => import("@/pages/SupportPage"),
  "/subscriptions": () => import("@/pages/Subscriptions"),
  "/integrations/notifications": () => import("@/pages/NotificationsPage"),
  "/integrations/woocommerce": () => import("@/pages/WooCommercePage"),
  "/integrations/whatsapp": () => import("@/pages/WhatsAppPage"),
  "/finance/sales-profit": () => import("@/pages/SalesProfit"),
  "/finance/income-expense": () => import("@/pages/IncomeExpense"),
  "/referral": () => import("@/pages/Referral"),
  "/notification-center": () => import("@/pages/NotificationCenter"),
  "/offline/suppliers": () => import("@/pages/Suppliers"),
  "/offline/purchases": () => import("@/pages/Purchases"),
  "/offline/cash-register": () => import("@/pages/CashRegister"),
  "/offline/customer-credits": () => import("@/pages/CustomerCredits"),
  "/offline/due-customers": () => import("@/pages/DueCustomers"),
  "/offline/daily-report": () => import("@/pages/DailySalesReport"),
  "/offline/profit-loss": () => import("@/pages/OfflineProfitLoss"),
  "/offline/stock-alerts": () => import("@/pages/StockAlerts"),
  "/offline/loyalty": () => import("@/pages/LoyaltyPoints"),
  "/staff-inbox": () => import("@/pages/StaffInbox"),
};

/** Prefetch a route's JS chunk (no-op if already done) */
export function prefetchRoute(path: string) {
  const cleanPath = path.split("?")[0]; // strip query params
  if (prefetchedRoutes.has(cleanPath)) return;
  const factory = routeImports[cleanPath];
  if (factory) {
    prefetchedRoutes.add(cleanPath);
    // Use requestIdleCallback for non-blocking prefetch
    const schedule = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 100));
    schedule(() => {
      factory().catch(() => {
        // silent fail — will load normally on navigation
        prefetchedRoutes.delete(cleanPath);
      });
    });
  }
}

/** Prefetch critical routes after initial load */
export function prefetchCriticalRoutes() {
  const critical = ["/dashboard", "/pos", "/orders", "/products"];
  const schedule = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 200));
  schedule(() => {
    critical.forEach(prefetchRoute);
  });
}

/** Create hover/focus handlers for a link element */
export function createPrefetchHandlers(path: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    onMouseEnter: () => {
      timer = setTimeout(() => prefetchRoute(path), 50);
    },
    onMouseLeave: () => {
      if (timer) clearTimeout(timer);
    },
    onFocus: () => prefetchRoute(path),
  };
}
