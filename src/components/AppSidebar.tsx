import {
  LayoutDashboard, Package, Users, ShoppingCart, CreditCard,
  Settings, Plug, Monitor, ClipboardList, Plus, Clock, ChevronDown, Tag, FileText,
  TrendingUp, ArrowUpDown, BookOpen, Megaphone, ListTodo, BarChart3, RefreshCw, Crown,
  Bell, ShoppingBag, Bot, MessageCircle, MessageSquare, Gift, Headphones, Zap, Sheet, Lock,
  Truck, Wallet, Star, AlertTriangle, Receipt, CalendarDays
} from "lucide-react";
import SidebarUsageWidget from "@/components/SidebarUsageWidget";
import brandLogo from "@/assets/evixPos.png";
import brandIcon from "@/assets/evixpos-icon.png";
import { useNavigate, useLocation } from "react-router-dom";
import { prefetchRoute } from "@/lib/routePrefetch";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useStaff } from "@/contexts/StaffContext";
import { useStore } from "@/contexts/StoreContext";
import { useStorePlan, FeatureKey } from "@/hooks/useStorePlan";
import { useMessageUnread } from "@/hooks/useMessageUnread";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";

type NavItem = { title: string; icon: any; path: string; perm?: string; feature?: FeatureKey; onlineOnly?: boolean; offlineOnly?: boolean };

const AppSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { state } = useSidebar();
  const { t } = useLanguage();
  const { isStaff, staffInfo, hasPermission } = useStaff();
  const { activeStore } = useStore();
  const { plan, hasFeature } = useStorePlan();
  const { unreadCount: msgUnread } = useMessageUnread();
  const collapsed = state === "collapsed";
  const isOffline = activeStore?.store_mode === "offline";

  const overviewItems: NavItem[] = [
    { title: t.dashboard, icon: LayoutDashboard, path: "/dashboard" },
    { title: t.posTerminal, icon: Monitor, path: "/pos", perm: "pos.access" },
  ];
  const orderSubItems: NavItem[] = [
    { title: t.allOrders, icon: ClipboardList, path: "/orders", perm: "orders.view" },
    { title: t.createOrder, icon: Plus, path: "/orders?tab=create", perm: "orders.create" },
    { title: t.pendingOrders, icon: Clock, path: "/orders/pending", perm: "orders.view" },
  ];
  const productSubItems: NavItem[] = [
    { title: t.products, icon: Package, path: "/products", perm: "products.view" },
    { title: "Inventory", icon: Truck, path: "/inventory", perm: "products.view", onlineOnly: true },
    { title: t.orderForms, icon: FileText, path: "/order-forms", perm: "products.view", feature: "order_forms", onlineOnly: true },
    { title: t.coupons, icon: Tag, path: "/coupons", perm: "products.edit", feature: "coupons" },
  ];
  const crmItems: NavItem[] = [
    { title: t.customers, icon: Users, path: "/customers", perm: "customers.view" },
    { title: t.subscriptions, icon: RefreshCw, path: "/subscriptions", perm: "customers.view", feature: "subscriptions", onlineOnly: true },
    { title: "Customer Credits", icon: Receipt, path: "/offline/customer-credits", perm: "customers.view", offlineOnly: true },
    { title: "Due Customers", icon: AlertTriangle, path: "/offline/due-customers", perm: "customers.view", offlineOnly: true },
    { title: "Loyalty Points", icon: Star, path: "/offline/loyalty", perm: "customers.view", offlineOnly: true },
  ];
  const offlineOpsItems: NavItem[] = [
    { title: "Suppliers & Purchases", icon: Truck, path: "/online/suppliers-purchases", perm: "products.edit", onlineOnly: true },
    { title: "Suppliers", icon: Truck, path: "/offline/suppliers", perm: "products.view", offlineOnly: true },
    { title: "Purchases", icon: ShoppingBag, path: "/offline/purchases", perm: "products.edit", offlineOnly: true },
    { title: "Cash Register", icon: Wallet, path: "/offline/cash-register", perm: "pos.access", offlineOnly: true },
    { title: "Stock Alerts", icon: AlertTriangle, path: "/offline/stock-alerts", perm: "products.view", offlineOnly: true },
  ];
  const financeSubItems: NavItem[] = [
    { title: t.salesProfit, icon: TrendingUp, path: "/finance/sales-profit", perm: "reports.view", feature: "reports", onlineOnly: true },
    { title: t.incomeExpense, icon: ArrowUpDown, path: "/finance/income-expense", perm: "reports.view", feature: "reports" },
    { title: t.dueBook, icon: BookOpen, path: "/finance/due-book", perm: "reports.view", feature: "due_book", onlineOnly: true },
    { title: t.adCosts, icon: Megaphone, path: "/finance/ad-costs", perm: "reports.view", feature: "ad_costs", onlineOnly: true },
    { title: t.taskMission, icon: ListTodo, path: "/finance/tasks", perm: "orders.view", feature: "task_mission", onlineOnly: true },
    { title: "Daily Report", icon: CalendarDays, path: "/offline/daily-report", perm: "reports.view", offlineOnly: true },
    { title: "Profit & Loss", icon: TrendingUp, path: "/offline/profit-loss", perm: "reports.view", offlineOnly: true },
    { title: "Staff Performance", icon: Users, path: "/offline/staff-performance", perm: "reports.view", offlineOnly: true },
  ];
  const integrationSubItems: NavItem[] = [
    { title: t.notifications, icon: Bell, path: "/integrations/notifications" },
    { title: t.woocommerce, icon: ShoppingBag, path: "/integrations/woocommerce", perm: "settings.edit", feature: "woocommerce", onlineOnly: true },
    { title: t.botAutomation, icon: Bot, path: "/integrations/bot-automation", perm: "settings.edit", feature: "bot_automation", onlineOnly: true },
    { title: t.whatsapp, icon: MessageCircle, path: "/integrations/whatsapp", perm: "settings.edit", feature: "whatsapp" },
    { title: t.googleSheets, icon: Sheet, path: "/integrations/google-sheets", perm: "settings.edit", feature: "google_sheets" },
    { title: "Facebook Ads", icon: Zap, path: "/integrations/facebook-ads", perm: "reports.view", feature: "ad_costs", onlineOnly: true },
  ];

  const filterByPerm = (items: NavItem[]) =>
    items.filter(item => {
      if (item.perm && !hasPermission(item.perm)) return false;
      if (item.onlineOnly && isOffline) return false;
      if (item.offlineOnly && !isOffline) return false;
      return true;
    });

  const filteredOverview = filterByPerm(overviewItems);
  const filteredOrders = filterByPerm(orderSubItems);
  const filteredProducts = filterByPerm(productSubItems);
  const filteredCrm = filterByPerm(crmItems);
  const filteredFinance = filterByPerm(financeSubItems);
  const filteredIntegrations = filterByPerm(integrationSubItems);
  const filteredOfflineOps = filterByPerm(offlineOpsItems);

  const showReferral = !isStaff;
  const showMyPlan = !isStaff;
  const showSettings = !isStaff || hasPermission("settings.view");

  const [ordersOpen, setOrdersOpen] = useState(location.pathname.startsWith("/orders"));
  const [productsOpen, setProductsOpen] = useState(["/products", "/order-forms", "/coupons", "/inventory"].some(p => location.pathname.startsWith(p)));
  const [financeOpen, setFinanceOpen] = useState(location.pathname.startsWith("/finance") || location.pathname.startsWith("/offline"));
  const [integrationsOpen, setIntegrationsOpen] = useState(location.pathname.startsWith("/integrations"));

  const fullPath = location.pathname + location.search;

  // ---- Menu item ----
  const renderItem = (item: NavItem) => {
    const active = fullPath === item.path || (item.path === "/orders" && location.pathname === "/orders" && !location.search);
    const locked = item.feature ? !hasFeature(item.feature) : false;

    const button = (
      <SidebarMenuButton
        onClick={() => navigate(item.path)}
        onMouseEnter={() => prefetchRoute(item.path)}
        onFocus={() => prefetchRoute(item.path)}
        isActive={active}
        tooltip={item.title}
        className={`relative rounded-lg transition-all duration-200 ${
          active
            ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-semibold shadow-sm"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        } ${locked ? "bg-muted/20" : ""}`}
      >
        {active && !collapsed && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-primary" />
        )}
        <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
        <span className="flex items-center gap-1.5 justify-between flex-1 min-w-0 overflow-hidden">
          <span className="truncate">{item.title}</span>
          {locked && !collapsed && (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center justify-center shrink-0">
                    <Lock className="h-[18px] w-[18px] text-muted-foreground cursor-help" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4} className="font-medium">
                  Upgrade to access this feature
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </span>
      </SidebarMenuButton>
    );

    return <SidebarMenuItem key={item.path}>{button}</SidebarMenuItem>;
  };

  // ---- Collapsible group (in expanded mode) / icon button (in collapsed mode) ----
  const renderCollapsible = (
    label: string, icon: any, items: NavItem[],
    open: boolean, setOpen: (v: boolean) => void, activePath: string
  ) => {
    const Icon = icon;
    const isActive = items.some(it => fullPath === it.path) || location.pathname.startsWith(activePath);

    if (collapsed) {
      // In collapsed mode render the parent as a single icon button that
      // navigates to the first child. Tooltip shows the section name.
      return (
        <SidebarMenuItem key={label}>
          <SidebarMenuButton
            onClick={() => navigate(items[0].path)}
            isActive={isActive}
            tooltip={label}
            className={`rounded-lg transition-all duration-200 ${
              isActive
                ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            }`}
          >
            <Icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
            <span className="truncate">{label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    return (
      <Collapsible key={label} open={open} onOpenChange={setOpen}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              className={`relative rounded-lg transition-all duration-200 ${
                isActive ? "text-foreground font-medium" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
              <span className="flex items-center justify-between flex-1 min-w-0">
                <span className="truncate">{label}</span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
              </span>
            </SidebarMenuButton>
          </CollapsibleTrigger>
        </SidebarMenuItem>
        <CollapsibleContent className="data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up overflow-hidden">
          <SidebarMenu className="ml-4 mt-1 pl-3 space-y-0.5 border-l border-border/60">
            {items.map(renderItem)}
          </SidebarMenu>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup key={label}>
      <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 px-3 mb-1">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="px-2 space-y-0.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">{items.map(renderItem)}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  // Messages item (custom because of badge)
  const renderMessages = () => {
    const active = fullPath === "/staff-inbox";
    const button = (
      <SidebarMenuButton
        onClick={() => navigate("/staff-inbox")}
        onMouseEnter={() => prefetchRoute("/staff-inbox")}
        isActive={active}
        tooltip={`Messages${msgUnread > 0 ? ` (${msgUnread})` : ""}`}
        className={`relative rounded-lg transition-all duration-200 ${
          active
            ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-semibold"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        }`}
      >
        <div className="relative shrink-0">
          <MessageSquare className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
          {collapsed && msgUnread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-3.5 min-w-3.5 px-1 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center ring-2 ring-sidebar">
              {msgUnread > 9 ? "9+" : msgUnread}
            </span>
          )}
        </div>
        <span className="flex items-center justify-between flex-1 min-w-0">
          <span className="truncate">Messages</span>
          {msgUnread > 0 && (
            <Badge className="h-5 min-w-5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] p-0 px-1.5 animate-pulse shrink-0">
              {msgUnread > 99 ? "99+" : msgUnread}
            </Badge>
          )}
        </span>
      </SidebarMenuButton>
    );
    return <SidebarMenuItem key="/staff-inbox">{button}</SidebarMenuItem>;
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60 bg-gradient-to-b from-sidebar to-sidebar/95 h-full flex flex-col overflow-hidden">
      <SidebarContent className="flex-1 overflow-y-auto min-h-0 overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* Brand */}
        <div className={`flex items-center ${collapsed ? "justify-center px-0" : "px-4"} py-4 border-b border-border/40`}>
          {collapsed ? (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate("/dashboard")}
                    className="h-8 w-8 rounded-lg overflow-hidden flex items-center justify-center shadow-md shadow-primary/20 transition-transform hover:scale-105"
                    aria-label="Dashboard"
                  >
                    <img src={brandIcon} alt="EvixPOS" width={32} height={32} loading="eager" decoding="async" fetchPriority="high" className="h-full w-full object-cover" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">EvixPOS · {plan}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 group min-w-0">
              <img src={brandLogo} alt="EvixPOS" width={120} height={28} loading="eager" decoding="async" fetchPriority="high" className="h-7 w-auto transition-transform group-hover:scale-105" />
              <span className="text-[10px] bg-gradient-to-r from-primary/15 to-primary/5 ring-1 ring-primary/20 px-1.5 py-0.5 rounded font-semibold text-primary uppercase tracking-wide">
                {plan}
              </span>
            </button>
          )}
        </div>

        {/* Sections */}
        {filteredOverview.length > 0 && renderGroup(t.overview, filteredOverview)}

        {(filteredOrders.length > 0 || filteredProducts.length > 0) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 px-3 mb-1">
              {t.salesProducts}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2 space-y-0.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
                {filteredOrders.length > 0 && renderCollapsible(t.orders, ShoppingCart, filteredOrders, ordersOpen, setOrdersOpen, "/orders")}
                {filteredProducts.length > 0 && renderCollapsible(t.productCatalog, Package, filteredProducts, productsOpen, setProductsOpen, "/products")}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredCrm.length > 0 && renderGroup(t.crmBilling, filteredCrm)}

        {filteredOfflineOps.length > 0 && renderGroup("Store Operations", filteredOfflineOps)}

        {(filteredFinance.length > 0 || hasPermission("reports.view")) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 px-3 mb-1">
              {t.performance}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2 space-y-0.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
                {filteredFinance.length > 0 && renderCollapsible(t.finances, CreditCard, filteredFinance, financeOpen, setFinanceOpen, "/finance")}
                {hasPermission("reports.view") && renderItem({ title: t.reports, icon: BarChart3, path: "/reports" })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(filteredIntegrations.length > 0 || showReferral) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 px-3 mb-1">
              {t.systemGrowth}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2 space-y-0.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
                {filteredIntegrations.length > 0 && renderCollapsible(t.integrations, Plug, filteredIntegrations, integrationsOpen, setIntegrationsOpen, "/integrations")}
                {showReferral && renderItem({ title: t.referral, icon: Gift, path: "/referral", feature: "referral" })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(showMyPlan || showSettings) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 px-3 mb-1">
              {t.supportSection}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2 space-y-0.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
                {renderMessages()}
                {showMyPlan && renderItem({ title: t.myPlan, icon: Crown, path: "/my-plan" })}
                {renderItem({ title: t.support, icon: Headphones, path: "/support" })}
                {showSettings && renderItem({ title: t.settings, icon: Settings, path: "/settings" })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Staff badge */}
        {isStaff && !collapsed && (
          <div className="mx-3 mt-2 mb-1 p-2.5 rounded-xl bg-gradient-to-br from-accent/60 to-accent/20 border border-border/60">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] capitalize border-primary/30 text-primary bg-primary/5">{staffInfo?.role}</Badge>
              <span className="text-[10px] text-muted-foreground truncate">{staffInfo?.name}</span>
            </div>
            <p className="text-[10px] text-muted-foreground/80 mt-1">Staff account</p>
          </div>
        )}
      </SidebarContent>

      <SidebarFooter className={`border-t border-border/40 ${collapsed ? "p-1.5" : "p-3"}`}>
        {collapsed ? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-full h-9 text-primary hover:bg-primary/10"
                  onClick={() => navigate("/my-plan")}
                  aria-label="Upgrade plan"
                >
                  <Zap className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">Upgrade plan</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <SidebarUsageWidget navigate={navigate} plan={plan} />
        )}
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
