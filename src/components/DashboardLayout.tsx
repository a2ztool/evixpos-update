import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from "./AppSidebar";
import StoreSwitcher from "./StoreSwitcher";
import NotificationBell from "./NotificationBell";
import FloatingInbox from "./FloatingInbox";
import SupportPopup from "./SupportPopup";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search, Download, Moon, Sun, Globe, LogOut, Settings, User,
  Crown, Command, Keyboard,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, Lang } from "@/contexts/LanguageContext";
import { useStaff } from "@/contexts/StaffContext";
import { useStorePlan } from "@/hooks/useStorePlan";
import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

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
  const { signOut, user } = useAuth();
  const { lang, setLang } = useLanguage();
  const { isStaff, staffInfo } = useStaff();
  const { plan } = useStorePlan();
  const location = useLocation();
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(false);

  const displayName = isStaff && staffInfo ? staffInfo.name : (user?.email ?? "");
  const initials = isStaff && staffInfo
    ? staffInfo.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.slice(0, 2).toUpperCase() ?? "U");
  const pageTitle = routeTitles[location.pathname] || "Dashboard";

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
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
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top navbar — compact on mobile */}
          <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/40 pt-safe">
            <div className="flex items-center justify-between h-12 sm:h-14 px-3 sm:px-4 lg:px-6">
              {/* Left: trigger + store + title */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <SidebarTrigger className="text-muted-foreground hover:text-foreground flex-shrink-0 h-8 w-8" />
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
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hidden md:inline-flex">
                      <Keyboard className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p className="text-xs">Keyboard shortcuts</p></TooltipContent>
                </Tooltip>

                {/* Language - hidden on mobile */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground gap-1.5 hidden sm:inline-flex">
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
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={toggleDark}>
                      {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p className="text-xs">{darkMode ? "Light mode" : "Dark mode"}</p></TooltipContent>
                </Tooltip>

                {/* Backup - desktop only */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm"
                      className="h-8 px-3 text-xs font-medium gap-1.5 border-primary/20 text-primary hover:bg-primary/5 hidden md:inline-flex"
                      onClick={() => navigate("/settings?tab=backup")}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Backup
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p className="text-xs">Export your data</p></TooltipContent>
                </Tooltip>

                {/* Notifications */}
                <NotificationBell />

                {/* User Avatar */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full ml-0.5">
                      <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-[10px] sm:text-xs font-semibold">{initials}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{displayName}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {isStaff ? `Staff • ${staffInfo?.role}` : `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`}
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

          {/* Main content — proper bottom padding for mobile nav */}
          <main className="flex-1 px-3 py-2 sm:p-4 lg:p-8 animate-fade-in pb-24 sm:pb-4 lg:pb-8">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <MobileNav />

      {/* Floating widgets — owner/user dashboard only (hidden for staff & admin) */}
      {!isStaff && (
        <>
          <FloatingInbox />
          <SupportPopup />
        </>
      )}
    </SidebarProvider>
  );
};

// Mobile bottom nav
import { LayoutDashboard, Monitor, ShoppingCart, CreditCard, Package, Users as UsersIcon, RefreshCw as RefreshIcon, BarChart3 as ChartIcon, Plug, Crown as CrownIcon, Headphones as SupportIcon, MessageSquare } from "lucide-react";
import { prefetchRoute } from "@/lib/routePrefetch";
import { motion, AnimatePresence } from "framer-motion";

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
      <div className="pointer-events-auto mx-2 mb-[max(env(safe-area-inset-bottom),4px)]">
        {/* Main bar */}
        <div className="relative">
          {/* Glass bar background */}
          <div
            className="rounded-[28px] border border-white/30 dark:border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.12),0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.4)]"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(245,245,250,0.78) 50%, rgba(255,255,255,0.82) 100%)",
              backdropFilter: "blur(24px) saturate(180%)",
              WebkitBackdropFilter: "blur(24px) saturate(180%)",
            }}
          >
            {/* Dark mode override */}
            <div className="hidden dark:block absolute inset-0 rounded-[28px]" style={{
              background: "linear-gradient(135deg, rgba(30,30,40,0.88) 0%, rgba(20,20,30,0.82) 100%)",
            }} />

            <div className="relative z-10 flex items-end justify-around px-2 pt-2 pb-2.5">
              {/* Home */}
              <NavItem
                icon={LayoutDashboard}
                label="Home"
                path="/dashboard"
                navigate={navigate}
                location={location}
              />

              {/* POS */}
              <NavItem
                icon={Monitor}
                label="POS"
                path="/pos"
                navigate={navigate}
                location={location}
              />

              {/* CENTER — Staff: Messaging / Owner: Orders */}
              {isStaff ? (
                <CenterNavButton
                  icon={MessageSquare}
                  label="Chat"
                  isActive={false}
                  onClick={() => {
                    // Dispatch custom event to toggle floating inbox
                    window.dispatchEvent(new CustomEvent("toggle-floating-inbox"));
                  }}
                />
              ) : (
                <CenterNavButton
                  icon={ShoppingCart}
                  label="Orders"
                  isActive={location.pathname.startsWith("/orders")}
                  onClick={() => navigate("/orders")}
                />
              )}

              {/* Staff: Orders / Owner: Products */}
              {isStaff ? (
                <NavItem
                  icon={ShoppingCart}
                  label="Orders"
                  path="/orders"
                  navigate={navigate}
                  location={location}
                />
              ) : (
                <NavItem
                  icon={Package}
                  label="Products"
                  path="/products"
                  navigate={navigate}
                  location={location}
                />
              )}

              {/* Settings (replaces More) */}
              <NavItem
                icon={Settings}
                label="Settings"
                path="/settings"
                navigate={navigate}
                location={location}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Individual nav item (non-center) */
const NavItem = ({
  icon: Icon, label, path, navigate, location, isMore, isMoreActive
}: {
  icon: any; label: string; path: string;
  navigate: (p: string) => void; location: any;
  isMore?: boolean; isMoreActive?: boolean;
}) => {
  const active = isMore ? !!isMoreActive : (location.pathname === path || location.pathname.startsWith(path + "/"));

  return (
    <motion.button
      onClick={() => !isMore && navigate(path)}
      onMouseEnter={() => !isMore && prefetchRoute(path)}
      onFocus={() => !isMore && prefetchRoute(path)}
      whileTap={{ scale: 0.85 }}
      className="relative flex flex-col items-center gap-1 py-1 min-w-[56px]"
    >
      {/* Icon container */}
      <motion.div
        animate={active ? { y: -2, scale: 1.08 } : { y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300 ${
          active
            ? "bg-primary/10 shadow-sm"
            : "bg-transparent"
        }`}
      >
        <Icon
          className={`h-[22px] w-[22px] transition-colors duration-300 ${
            active ? "text-primary" : "text-muted-foreground/70"
          }`}
          strokeWidth={active ? 2.4 : 1.7}
        />
      </motion.div>

      {/* Label */}
      <span className={`text-[10px] tracking-wide transition-all duration-300 ${
        active ? "font-bold text-primary" : "font-medium text-muted-foreground/60"
      }`}>
        {label}
      </span>

      {/* Active indicator line */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ scaleX: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="w-5 h-[3px] rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.4)]"
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
};

/** Center raised nav button */
const CenterNavButton = ({
  icon: Icon, label, isActive, onClick
}: {
  icon: any; label: string; isActive: boolean; onClick: () => void;
}) => (
  <div className="relative flex flex-col items-center -mt-5">
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      className="relative"
    >
      <div className={`absolute inset-0 rounded-full transition-all duration-500 ${
        isActive ? "bg-primary/20 scale-[1.35] blur-md" : "bg-transparent scale-100"
      }`} />
      <motion.div
        animate={isActive ? { y: -4 } : { y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
          isActive
            ? "bg-primary shadow-[0_6px_24px_hsl(var(--primary)/0.45)]"
            : "bg-gradient-to-br from-primary/90 to-primary shadow-[0_4px_16px_hsl(var(--primary)/0.3)]"
        }`}
      >
        <div className="absolute inset-[2px] rounded-full bg-gradient-to-b from-white/25 to-transparent" />
        <Icon className="h-6 w-6 text-primary-foreground relative z-10" strokeWidth={2} />
      </motion.div>
    </motion.button>
    <motion.span
      animate={isActive ? { opacity: 1 } : { opacity: 0.6 }}
      className={`text-[10px] mt-1.5 font-semibold tracking-wide ${
        isActive ? "text-primary" : "text-muted-foreground"
      }`}
    >
      {label}
    </motion.span>
  </div>
);

export default DashboardLayout;
