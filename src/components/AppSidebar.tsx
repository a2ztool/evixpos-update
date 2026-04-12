import {
  LayoutDashboard, Package, Users, ShoppingCart, CreditCard,
  Settings, Plug, LogOut, Monitor, ClipboardList, Plus, Clock, ChevronDown, Tag, FileText,
  TrendingUp, ArrowUpDown, BookOpen, Megaphone, ListTodo, BarChart3, RefreshCw, Crown,
  Bell, ShoppingBag, Bot, MessageCircle, MessageSquare, Gift, Headphones, Zap, ExternalLink, Sheet, Lock
} from "lucide-react";
import SidebarUsageWidget from "@/components/SidebarUsageWidget";
import brandLogo from "@/assets/evixPos.png";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useStaff } from "@/contexts/StaffContext";
import { useStorePlan, FeatureKey } from "@/hooks/useStorePlan";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";

type NavItem = { title: string; icon: any; path: string; perm?: string; feature?: FeatureKey };

/** Maps each nav item to the permission required to see it */
const AppSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { state } = useSidebar();
  const { t } = useLanguage();
  const { isStaff, staffInfo, hasPermission, hasAnyPermission } = useStaff();
  const { plan, hasFeature } = useStorePlan();
  const collapsed = state === "collapsed";

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
    { title: t.orderForms, icon: FileText, path: "/order-forms", perm: "products.view", feature: "order_forms" },
    { title: t.coupons, icon: Tag, path: "/coupons", perm: "products.edit", feature: "coupons" },
  ];
  const crmItems: NavItem[] = [
    { title: t.customers, icon: Users, path: "/customers", perm: "customers.view" },
    { title: t.subscriptions, icon: RefreshCw, path: "/subscriptions", perm: "customers.view", feature: "subscriptions" },
  ];
  const financeSubItems: NavItem[] = [
    { title: t.salesProfit, icon: TrendingUp, path: "/finance/sales-profit", perm: "reports.view", feature: "reports" },
    { title: t.incomeExpense, icon: ArrowUpDown, path: "/finance/income-expense", perm: "reports.view", feature: "reports" },
    { title: t.dueBook, icon: BookOpen, path: "/finance/due-book", perm: "reports.view", feature: "due_book" },
    { title: t.adCosts, icon: Megaphone, path: "/finance/ad-costs", perm: "reports.view", feature: "ad_costs" },
    { title: "Facebook Ads", icon: Zap, path: "/finance/facebook-ads", perm: "reports.view", feature: "ad_costs" },
    { title: t.taskMission, icon: ListTodo, path: "/finance/tasks", perm: "orders.view", feature: "task_mission" },
  ];
  const integrationSubItems: NavItem[] = [
    { title: t.notifications, icon: Bell, path: "/integrations/notifications" },
    { title: t.woocommerce, icon: ShoppingBag, path: "/integrations/woocommerce", perm: "settings.edit", feature: "woocommerce" },
    { title: t.botAutomation, icon: Bot, path: "/integrations/bot-automation", perm: "settings.edit", feature: "bot_automation" },
    { title: t.whatsapp, icon: MessageCircle, path: "/integrations/whatsapp", perm: "settings.edit", feature: "whatsapp" },
    { title: t.googleSheets, icon: Sheet, path: "/integrations/google-sheets", perm: "settings.edit", feature: "google_sheets" },
  ];

  /** Filter items based on staff permissions */
  const filterByPerm = (items: NavItem[]) =>
    items.filter(item => !item.perm || hasPermission(item.perm));

  const filteredOverview = filterByPerm(overviewItems);
  const filteredOrders = filterByPerm(orderSubItems);
  const filteredProducts = filterByPerm(productSubItems);
  const filteredCrm = filterByPerm(crmItems);
  const filteredFinance = filterByPerm(financeSubItems);
  const filteredIntegrations = filterByPerm(integrationSubItems);

  // Owner-only sections: referral, my-plan, settings (staff can see settings.view)
  const showReferral = !isStaff;
  const showMyPlan = !isStaff;
  const showSettings = !isStaff || hasPermission("settings.view");

  const [ordersOpen, setOrdersOpen] = useState(location.pathname.startsWith("/orders"));
  const [productsOpen, setProductsOpen] = useState(["/products", "/order-forms", "/coupons"].includes(location.pathname));
  const [financeOpen, setFinanceOpen] = useState(location.pathname.startsWith("/finance"));
  const [integrationsOpen, setIntegrationsOpen] = useState(location.pathname.startsWith("/integrations"));

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "U";
  const fullPath = location.pathname + location.search;

  const renderItem = (item: NavItem) => {
    const active = fullPath === item.path || (item.path === "/orders" && location.pathname === "/orders" && !location.search);
    const locked = item.feature ? !hasFeature(item.feature) : false;
    return (
      <SidebarMenuItem key={item.path}>
        <SidebarMenuButton
          onClick={() => navigate(item.path)}
          isActive={active}
          className={`rounded-lg transition-all duration-150 ${
            active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          } ${locked ? "opacity-60" : ""}`}
        >
          <item.icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
          {!collapsed && (
            <span className="flex items-center gap-2 flex-1">
              {item.title}
              {locked && <Lock className="h-3 w-3 text-muted-foreground/70 ml-auto" />}
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderCollapsible = (
    label: string, icon: any, items: NavItem[],
    open: boolean, setOpen: (v: boolean) => void, activePath: string
  ) => {
    const Icon = icon;
    const isActive = location.pathname.startsWith(activePath);
    if (collapsed) {
      return (
        <SidebarMenuItem>
          <SidebarMenuButton onClick={() => navigate(items[0].path)} isActive={isActive} className="rounded-lg">
            <Icon className="h-4 w-4" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton className={`rounded-lg transition-all duration-150 justify-between ${isActive ? "text-primary font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                <span>{label}</span>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </SidebarMenuButton>
          </CollapsibleTrigger>
        </SidebarMenuItem>
        <CollapsibleContent>
          <SidebarMenu className="pl-4 space-y-0.5 mt-0.5">
            {items.map(renderItem)}
          </SidebarMenu>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup key={label}>
      <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 mb-1">
        {!collapsed && label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="px-2 space-y-0.5">{items.map(renderItem)}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarContent>
        <div className={`px-4 py-5 flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          {collapsed ? (
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-primary-foreground font-bold text-sm">E</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <img src={brandLogo} alt="EvixPOS" className="h-7 w-auto" />
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium text-muted-foreground uppercase">{plan}</span>
            </div>
          )}
        </div>

        {filteredOverview.length > 0 && renderGroup(t.overview, filteredOverview)}

        {(filteredOrders.length > 0 || filteredProducts.length > 0) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 mb-1">
              {!collapsed && t.salesProducts}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2 space-y-0.5">
                {filteredOrders.length > 0 && renderCollapsible(t.orders, ShoppingCart, filteredOrders, ordersOpen, setOrdersOpen, "/orders")}
                {filteredProducts.length > 0 && renderCollapsible(t.productCatalog, Package, filteredProducts, productsOpen, setProductsOpen, "/products")}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredCrm.length > 0 && renderGroup(t.crmBilling, filteredCrm)}

        {(filteredFinance.length > 0 || hasPermission("reports.view")) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 mb-1">
              {!collapsed && t.performance}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2 space-y-0.5">
                {filteredFinance.length > 0 && renderCollapsible(t.finances, CreditCard, filteredFinance, financeOpen, setFinanceOpen, "/finance")}
                {hasPermission("reports.view") && renderItem({ title: t.reports, icon: BarChart3, path: "/reports" })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(filteredIntegrations.length > 0 || showReferral) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 mb-1">
              {!collapsed && t.systemGrowth}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2 space-y-0.5">
                {filteredIntegrations.length > 0 && renderCollapsible(t.integrations, Plug, filteredIntegrations, integrationsOpen, setIntegrationsOpen, "/integrations")}
                {showReferral && renderItem({ title: t.referral, icon: Gift, path: "/referral", feature: "referral" })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(showMyPlan || showSettings) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 mb-1">
              {!collapsed && t.supportSection}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2 space-y-0.5">
                {!isStaff && renderItem({ title: "Staff Inbox", icon: MessageSquare, path: "/staff-inbox" })}
                {showMyPlan && renderItem({ title: t.myPlan, icon: Crown, path: "/my-plan" })}
                {renderItem({ title: t.support, icon: Headphones, path: "/support" })}
                {showSettings && renderItem({ title: t.settings, icon: Settings, path: "/settings" })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Staff badge */}
        {isStaff && !collapsed && (
          <div className="mx-4 mb-2 p-3 rounded-xl bg-accent/50 border border-border">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] capitalize border-primary/30 text-primary">{staffInfo?.role}</Badge>
              <span className="text-[10px] text-muted-foreground truncate">{staffInfo?.name}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Staff account</p>
          </div>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-border/50 space-y-3">
        {/* Product Limit Widget */}
        {!collapsed ? (
          <SidebarUsageWidget navigate={navigate} plan={plan} />
        ) : (
          <Button variant="ghost" size="icon" className="w-full text-primary" onClick={() => navigate("/my-plan")}>
            <Zap className="h-4 w-4" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
