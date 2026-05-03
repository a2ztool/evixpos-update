import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from "./AppSidebar";
import StoreSwitcher from "./StoreSwitcher";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Moon, Sun, Globe, LogOut, Settings, User, Crown, Command, Keyboard, Smartphone, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import InstallAppButton from "./InstallAppButton";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { toast } from "sonner";
import BackButton from "./BackButton";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
import { useLanguage, Lang } from "@/contexts/LanguageContext";
import { useStaff } from "@/contexts/StaffContext";
import { useStorePlan } from "@/hooks/useStorePlan";
import { useLocation, useNavigate } from "react-router-dom";
import { lazy, Suspense, useState, useEffect, createContext, useContext } from "react";

/**
 * Context flag set by the persistent layout route. When true, any inner
 * <DashboardLayout> rendered by a page becomes a passthrough so the real
 * sidebar/header stay mounted across route changes (no remount = instant nav).
 */
const LayoutMountedContext = createContext(false);
export const PersistentDashboardLayout = ({ children }: { children: React.ReactNode }) => (
  <LayoutMountedContext.Provider value={true}>
    <DashboardLayoutInner>{children}</DashboardLayoutInner>
  </LayoutMountedContext.Provider>
);

const LazyNotificationBell = lazy(() => import("./NotificationBell"));
const LazyFloatingInbox = lazy(() => import("./FloatingInbox"));
const LazySupportPopup = lazy(() => import("./SupportPopup"));

const langLabels: Record<Lang, string> = { en: "EN", bn: "বাং", hi: "हि" };
const langFullLabels: Record<Lang, string> = { en: "English", bn: "বাংলা", hi: "हिन्दी" };

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/pos": "POS Terminal",
  "/orders": "Orders",
  "/orders/pending": "Pending Orders",
  "/products": "Products",
  "/order-forms": "Order Forms",
  "/coupons": "Coupons",
  "/customers": "Customers",
  "/subscriptions": "Subscriptions",
  "/finance/sales-profit": "Sales & Profit",
  "/finance/income-expense": "Income & Expense",
  "/finance/due-book": "Due Book",
  "/finance/ad-costs": "Ad Costs",
  "/finance/tasks": "Task & Mission",
  "/reports": "Reports",
  "/integrations/notifications": "Notifications",
  "/integrations/woocommerce": "WooCommerce",
  "/integrations/bot-automation": "Bot Automation",
  "/integrations/whatsapp": "WhatsApp",
  "/integrations/google-sheets": "Google Sheets",
  "/finance/facebook-ads": "Facebook Ads",
  "/referral": "Referral",
  "/my-plan": "My Plan",
  "/support": "Support & Guide",
  "/settings": "Settings",
  "/transactions": "Finance",
  "/notification-center": "Notification Center",
  "/inventory": "Inventory",
  "/offline/suppliers": "Suppliers",
  "/offline/purchases": "Purchases",
  "/offline/cash-register": "Cash Register",
  "/offline/customer-credits": "Customer Credits",
  "/offline/loyalty": "Loyalty Points",
  "/offline/due-customers": "Due Customers",
  "/offline/stock-alerts": "Stock Alerts",
  "/offline/daily-report": "Daily Report",
  "/offline/profit-loss": "Profit & Loss",
  "/offline/staff-performance": "Staff Performance",
  "/staff-inbox": "Staff Inbox",
};

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  // If the persistent layout is already mounted higher in the tree, just
  // render the page content — never remount sidebar/header on navigation.
  const alreadyMounted = useContext(LayoutMountedContext);
  if (alreadyMounted) return <>{children}</>;
  return <DashboardLayoutInner>{children}</DashboardLayoutInner>;
};

const DashboardLayoutInner = ({ children }: { children: React.ReactNode }) => {
  const { signOut, user } = useAuth();
  const { lang, setLang } = useLanguage();
  const { isStaff, staffInfo } = useStaff();
  const { plan } = useStorePlan();
  const { canInstall, isInstalled, isStandalone, promptInstall } = usePWAInstall();
  const appInstalled = isInstalled || isStandalone;
  const handleInstallApp = async () => {
    if (appInstalled) return;
    if (canInstall) {
      const ok = await promptInstall();
      if (ok) toast.success("App installed!", { description: "EvixPOS is now on your device." });
    } else {
      toast.info("Install via your browser menu", {
        description: "Open browser menu → 'Add to Home Screen' or 'Install App'.",
      });
    }
  };
  const location = useLocation();
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [notificationReady, setNotificationReady] = useState(false);
  const [widgetsReady, setWidgetsReady] = useState(false);
  const { symbol: currencySymbol, activeCurrency } = useCurrency();
  const isPOS = location.pathname.startsWith("/pos");

  const displayName = isStaff && staffInfo ? staffInfo.name : (user?.email ?? "");
  const initials =
    isStaff && staffInfo
      ? staffInfo.name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : (user?.email?.slice(0, 2).toUpperCase() ?? "U");
  const pageTitle = routeTitles[location.pathname] || "Dashboard";

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  useEffect(() => {
    const notificationTimer = setTimeout(() => setNotificationReady(true), 900);
    const widgetsTimer = setTimeout(() => setWidgetsReady(true), 1800);
    return () => {
      clearTimeout(notificationTimer);
      clearTimeout(widgetsTimer);
    };
  }, []);

  const toggleDark = () => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  };

  return (
    <SidebarProvider>
      <div className="w-full bg-background flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="min-w-0 flex-1 flex flex-col h-screen overflow-hidden">
          {/* Top navbar — sticky inside scroll column */}
          <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/40 pt-safe shrink-0">
            <div className="flex items-center justify-between h-12 sm:h-14 px-3 sm:px-4 lg:px-6">
              {/* Left: trigger + store + title */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <SidebarTrigger className="text-muted-foreground hover:text-foreground flex-shrink-0 h-8 w-8" />
                <BackButton />
                <StoreSwitcher />
                <div className="hidden md:block h-5 w-px bg-border/50" />
                {/* Desktop page title */}
                <h1 className="text-sm font-semibold truncate hidden md:block">{pageTitle}</h1>
                <div className="hidden sm:block relative ml-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    className="pl-9 w-56 lg:w-72 h-8 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-ring/30 rounded-xl text-sm"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-0.5">
                    <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border border-border/60 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground flex">
                      <Command className="h-2.5 w-2.5" />K
                    </kbd>
                  </div>
                </div>
              </div>

              {/* Right: actions — fewer items on mobile */}
              <div className="flex items-center gap-0.5 sm:gap-1">
                {/* Keyboard Shortcuts - desktop only */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShortcutsOpen(true)}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground hidden md:inline-flex"
                    >
                      <Keyboard className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Keyboard shortcuts</p>
                  </TooltipContent>
                </Tooltip>

                {/* Language - hidden on mobile */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-muted-foreground hover:text-foreground gap-1.5 hidden sm:inline-flex"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">{langLabels[lang]}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuLabel className="text-xs">Language</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {(Object.keys(langFullLabels) as Lang[]).map((l) => (
                      <DropdownMenuItem key={l} onClick={() => setLang(l)} className={lang === l ? "bg-accent" : ""}>
                        <span className="text-sm">{langFullLabels[l]}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Dark Mode */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={toggleDark}
                    >
                      {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">{darkMode ? "Light mode" : "Dark mode"}</p>
                  </TooltipContent>
                </Tooltip>

                {/* Install App - desktop only */}
                <InstallAppButton className="hidden md:inline-flex" />

                {/* Currency badge — single source of truth */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="hidden sm:flex items-center gap-1 h-8 px-2.5 rounded-md border border-border/60 bg-muted/40 text-xs font-semibold text-foreground/80">
                      <span className="text-primary">{currencySymbol}</span>
                      <span className="text-muted-foreground">{activeCurrency}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Display currency · Change in Settings</p>
                  </TooltipContent>
                </Tooltip>

                {/* Notifications */}
                {notificationReady ? (
                  <Suspense fallback={<div className="h-8 w-8" aria-hidden />}>
                    <LazyNotificationBell />
                  </Suspense>
                ) : (
                  <div className="h-8 w-8" aria-hidden />
                )}

                {/* User Avatar */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full ml-0.5">
                      <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-[10px] sm:text-xs font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{displayName}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {isStaff
                            ? `Staff • ${staffInfo?.role}`
                            : `${(plan ?? "free").charAt(0).toUpperCase() + (plan ?? "free").slice(1)} Plan`}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {!isStaff && (
                      <DropdownMenuItem onClick={() => navigate("/settings")}>
                        <User className="h-4 w-4 mr-2" /> Profile
                      </DropdownMenuItem>
                    )}
                    {!isStaff && (
                      <DropdownMenuItem onClick={() => navigate("/settings")}>
                        <Settings className="h-4 w-4 mr-2" /> Settings
                      </DropdownMenuItem>
                    )}
                    {!isStaff && (
                      <DropdownMenuItem onClick={() => navigate("/my-plan")}>
                        <Crown className="h-4 w-4 mr-2" /> My Plan
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={handleInstallApp}
                      disabled={appInstalled}
                      className="md:hidden"
                    >
                      {appInstalled ? (
                        <>
                          <Check className="h-4 w-4 mr-2 text-primary" /> App Installed
                        </>
                      ) : (
                        <>
                          <Smartphone className="h-4 w-4 mr-2 text-primary" /> Install App
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                      <LogOut className="h-4 w-4 mr-2" /> Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          {/* Mobile page title bar */}
          <div className="sm:hidden px-4 pt-3 pb-1">
            <h1 className="text-lg font-bold text-foreground">{pageTitle}</h1>
          </div>

          {/* Main content — independent scroll area */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 pb-[112px] animate-fade-in sm:p-4 sm:pb-4 lg:p-8 lg:pb-8" style={{ WebkitOverflowScrolling: "touch" }}>
            <div className="max-w-7xl mx-auto w-full min-w-0">{children}</div>
          </main>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <MobileNav />

      {/* Floating widgets */}
      {widgetsReady && (
        <Suspense fallback={null}>
          <LazyFloatingInbox />
          {!isStaff && <LazySupportPopup />}
        </Suspense>
      )}

      {/* Global Keyboard Shortcuts Dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-primary" /> Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isPOS ? "POS Terminal shortcuts" : "Global app shortcuts"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {(isPOS
              ? [
                  ["F1 or /", "Focus product search"],
                  ["F2", "Hold current order"],
                  ["F3", "Resume held orders"],
                  ["F4", "Recent transactions"],
                  ["F8", "Clear cart"],
                  ["Enter", "Open checkout"],
                ]
              : [
                  ["⌘ / Ctrl + K", "Quick search"],
                  ["G then D", "Go to Dashboard"],
                  ["G then P", "Go to POS"],
                  ["G then O", "Go to Orders"],
                  ["?", "Show this help"],
                ]
            ).map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{desc}</span>
                <kbd className="text-xs bg-muted px-2 py-0.5 rounded border font-mono">{key}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

// Mobile bottom nav
import {
  LayoutDashboard,
  Monitor,
  ShoppingCart,
  CreditCard,
  Package,
  Users as UsersIcon,
  RefreshCw as RefreshIcon,
  BarChart3 as ChartIcon,
  Plug,
  Crown as CrownIcon,
  Headphones as SupportIcon,
  MessageSquare,
} from "lucide-react";
import { prefetchRoute } from "@/lib/routePrefetch";

const ownerMoreMenuItems = [
  { icon: CreditCard, path: "/transactions", label: "Finance" },
  { icon: UsersIcon, path: "/customers", label: "Customers" },
  { icon: RefreshIcon, path: "/subscriptions", label: "Subscriptions" },
  { icon: ChartIcon, path: "/reports", label: "Reports" },
  { icon: Plug, path: "/integrations/notifications", label: "Integrations" },
  { icon: CrownIcon, path: "/my-plan", label: "My Plan" },
  { icon: SupportIcon, path: "/support", label: "Support" },
];

const staffMoreMenuItems = [
  { icon: UsersIcon, path: "/customers", label: "Customers" },
  { icon: SupportIcon, path: "/support", label: "Support" },
];

const MobileNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isStaff } = useStaff();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden pointer-events-none">
      <div className="pointer-events-auto relative w-full">
        {/* SVG notched bar — full-width, top-rounded only, flush to bottom */}
        <div className="relative" style={{ filter: "drop-shadow(0 -6px 20px rgba(0,0,0,0.10)) drop-shadow(0 -1px 4px rgba(0,0,0,0.05))" }}>
          <svg
            viewBox="0 0 400 88"
            preserveAspectRatio="none"
            className="w-full h-[82px] block"
            aria-hidden
          >
            <defs>
              <linearGradient id="navBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--card))" stopOpacity="1" />
                <stop offset="100%" stopColor="hsl(var(--card))" stopOpacity="0.98" />
              </linearGradient>
            </defs>
            {/* Top-rounded rect with curved notch on top-center; bottom flush square */}
            <path
              d="
                M 24 0
                L 158 0
                C 168 0, 168 8, 174 14
                C 182 22, 192 28, 200 28
                C 208 28, 218 22, 226 14
                C 232 8, 232 0, 242 0
                L 376 0
                Q 400 0, 400 24
                L 400 88
                L 0 88
                L 0 24
                Q 0 0, 24 0
                Z
              "
              fill="url(#navBarGrad)"
              stroke="hsl(var(--border))"
              strokeWidth="0.5"
              strokeOpacity="0.4"
            />
          </svg>

          {/* Icons overlaid on top of SVG */}
          <div
            className="absolute inset-x-0 top-0 grid grid-cols-5 items-center px-2 pt-3"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)", height: "100%" }}
          >
            <NavItem icon={LayoutDashboard} label="Home" path="/dashboard" navigate={navigate} location={location} />
            <NavItem icon={Monitor} label="POS" path="/pos" navigate={navigate} location={location} />
            <div aria-hidden />
            {isStaff ? (
              <NavItem icon={ShoppingCart} label="Orders" path="/orders" navigate={navigate} location={location} />
            ) : (
              <NavItem icon={Package} label="Products" path="/products" navigate={navigate} location={location} />
            )}
            <NavItem icon={Settings} label="Settings" path="/settings" navigate={navigate} location={location} />
          </div>
        </div>

        {/* Floating FAB — sits inside the notch */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-5 z-20">
          {isStaff ? (
            <CenterNavButton
              icon={MessageSquare}
              label=""
              isActive={false}
              onClick={() => window.dispatchEvent(new Event("toggle-floating-inbox"))}
            />
          ) : (
            <CenterNavButton
              icon={ShoppingCart}
              label=""
              isActive={location.pathname.startsWith("/orders")}
              onClick={() => navigate("/orders")}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/** Individual nav item (non-center) */
const NavItem = ({
  icon: Icon,
  label,
  path,
  navigate,
  location,
  isMore,
  isMoreActive,
}: {
  icon: any;
  label: string;
  path: string;
  navigate: (p: string) => void;
  location: any;
  isMore?: boolean;
  isMoreActive?: boolean;
}) => {
  const active = isMore ? !!isMoreActive : location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <button
      onClick={() => !isMore && navigate(path)}
      onMouseEnter={() => !isMore && prefetchRoute(path)}
      onFocus={() => !isMore && prefetchRoute(path)}
      className="relative flex flex-col items-center gap-0.5 py-1 min-w-[56px] active:scale-90 transition-transform duration-150"
    >
      {/* Icon container with glossy active state */}
      <div className={`relative transition-transform duration-200 ${active ? "-translate-y-0.5 scale-110" : "translate-y-0 scale-100"}`}>
        {/* Active glow backdrop */}
        {active && (
          <div className="absolute inset-0 w-10 h-10 rounded-2xl bg-primary/12 dark:bg-primary/20 blur-[2px]" />
        )}
        <div
          className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300 ${
            active ? "bg-primary/10 dark:bg-primary/15 shadow-[0_2px_12px_hsl(var(--primary)/0.15)]" : "bg-transparent"
          }`}
        >
          {/* Inner glossy highlight on active */}
          {active && (
            <div className="absolute inset-[1px] rounded-[14px] bg-gradient-to-b from-white/40 dark:from-white/10 to-transparent pointer-events-none" />
          )}
          <Icon
            className={`h-[21px] w-[21px] transition-all duration-300 relative z-10 ${
              active ? "text-primary drop-shadow-[0_1px_2px_hsl(var(--primary)/0.3)]" : "text-muted-foreground/65"
            }`}
            strokeWidth={active ? 2.4 : 1.6}
          />
        </div>
      </div>

      {/* Label */}
      <span
        className={`text-[10px] tracking-wide transition-all duration-300 ${
          active ? "font-bold text-primary" : "font-medium text-muted-foreground/55"
        }`}
      >
        {label}
      </span>

    </button>
  );
};

/** Center raised nav button — premium glossy */
const CenterNavButton = ({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: any;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) => (
  <div className="relative flex flex-col items-center">
    <button onClick={onClick} className="relative transition-transform duration-150 hover:scale-105 active:scale-90">
      {/* Soft colored halo (like reference) */}
      <div
        className={`absolute inset-0 rounded-full transition-all duration-500 ${
          isActive ? "bg-primary/35 scale-[1.6] blur-xl" : "bg-primary/25 scale-[1.45] blur-lg"
        }`}
      />

      {/* Main circular FAB */}
      <div
        className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${
          isActive
            ? "bg-gradient-to-b from-primary via-primary to-primary/90 shadow-[0_10px_30px_hsl(var(--primary)/0.55),0_2px_8px_hsl(var(--primary)/0.3)]"
            : "bg-gradient-to-b from-primary via-primary/95 to-primary/85 shadow-[0_8px_24px_hsl(var(--primary)/0.45),0_2px_6px_hsl(var(--primary)/0.25)]"
        }`}
      >
        {/* Top glossy shine */}
        <div className="absolute inset-[2px] rounded-full bg-gradient-to-b from-white/35 via-white/10 to-transparent pointer-events-none" />
        <div className="absolute inset-[3px] rounded-full border border-white/15 pointer-events-none" />
        <Icon
          className="h-6 w-6 text-primary-foreground relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
          strokeWidth={2.4}
        />
      </div>
    </button>
    {label && (
      <span
        className={`text-[10px] mt-1.5 font-bold tracking-wide ${isActive ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
      </span>
    )}
  </div>
);

export default DashboardLayout;
