import { lazy, Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { usePlansConfig } from "@/contexts/PlansConfigContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { lazyWithRetry } from "@/lib/lazyPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard, RefreshCw, AlertTriangle,
  Megaphone, Plus, Eye, ShoppingBag, Monitor, Repeat,
  ChevronRight, Sparkles, CalendarDays, Users, Package,
  MessageCircle, RotateCcw, Bell, Shield, Globe, MapPin,
  Receipt, Wallet, AlertCircle, BarChart3
} from "lucide-react";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { format, differenceInDays, addDays } from "date-fns";
import { toast } from "sonner";

const DashboardAnalytics = lazy(lazyWithRetry(() => import("@/components/DashboardAnalytics")));

interface Subscription {
  id: string;
  status: string;
  price: number;
  end_date: string | null;
  product_name: string;
  customer_id: string | null;
  variation: string;
  customers?: { name: string; phone: string } | null;
}

const Dashboard = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { isStaff, staffInfo } = useStaff();
  const { plan: rawPlan, volume: subVolume, loading: planLoading } = useSubscription();
  const plan = rawPlan ?? "free";
  const navigate = useNavigate();
  const [profileName, setProfileName] = useState("");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  const { getPlanLimits } = usePlansConfig();
  const dashLimits = getPlanLimits(plan, (subVolume ?? 500) as any);
  const productLimit = dashLimits.maxProducts;
  const productUsagePercent = productLimit > 0 ? Math.round((productCount / productLimit) * 100) : 0;

  const announcements = useMemo(() => {
    const msgs: string[] = [];
    if (!isStaff) {
      if (plan === "free") msgs.push("🚀 Upgrade to Pro for unlimited products, 3 stores & priority support!");
      if (plan === "pro") msgs.push("⭐ Upgrade to Business for 10 stores & advanced analytics!");
      msgs.push("🎉 Invite friends & earn 20% commission with our Referral Program!");
    }
    msgs.push("💡 Tip: Use the POS Terminal for faster in-store sales");
    return msgs;
  }, [plan, isStaff]);

  const [announcementIndex, setAnnouncementIndex] = useState(0);
  useEffect(() => {
    if (announcements.length <= 1) return;
    const interval = setInterval(() => {
      setAnnouncementIndex(prev => (prev + 1) % announcements.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [announcements.length]);

  const fetchMeta = useCallback(async () => {
    if (!user || !activeStore) return;
    const sid = activeStore.id;
    const [profileRes, subsRes, productsRes] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
      supabase.from("subscriptions").select("id, status, price, end_date, product_name, customer_id, variation, customers(name, phone)").eq("store_id", sid),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", sid),
    ]);
    if (profileRes.data) setProfileName(profileRes.data.name);
    setSubscriptions((subsRes.data ?? []) as Subscription[]);
    setProductCount(productsRes.count ?? 0);
  }, [user, activeStore]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  useEffect(() => {
    if (isStaff) return;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (window.requestIdleCallback) {
      idleId = window.requestIdleCallback(() => setShowAnalytics(true));
    } else {
      timeoutId = setTimeout(() => setShowAnalytics(true), 1200);
    }
    return () => {
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [isStaff]);

  // Real-time sync for dashboard data
  useRealtimeSync(
    `dashboard-meta-${activeStore?.id}`,
    [
      { table: "orders", filter: `store_id=eq.${activeStore?.id}` },
      { table: "products", filter: `store_id=eq.${activeStore?.id}` },
      { table: "subscriptions", filter: `store_id=eq.${activeStore?.id}` },
      { table: "customers", filter: `store_id=eq.${activeStore?.id}` },
    ],
    fetchMeta,
    !!activeStore?.id && !!user
  );

  // Expiring within 2 days (urgent)
  const expiringUrgent = useMemo(() => {
    return subscriptions
      .filter(s => {
        if (s.status !== "active" || !s.end_date) return false;
        const daysLeft = differenceInDays(new Date(s.end_date), new Date());
        return daysLeft >= 0 && daysLeft <= 2;
      })
      .sort((a, b) => new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime());
  }, [subscriptions]);

  const sendWhatsAppReminder = (sub: Subscription) => {
    const customer = sub.customers;
    if (!customer?.phone) { toast.error("Customer has no phone number"); return; }
    const daysLeft = differenceInDays(new Date(sub.end_date!), new Date());
    const message = `Hi ${customer.name}, your subscription for "${sub.product_name}" (${sub.variation}) ${daysLeft <= 0 ? "has expired" : `will expire in ${daysLeft} day(s)`}. Please renew to continue service. Thank you!`;
    const whatsappUrl = `https://wa.me/${customer.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
    toast.success("WhatsApp opened");
  };

  const handleQuickRenew = async (sub: Subscription) => {
    const newStart = sub.end_date || new Date().toISOString();
    const durationDays = 30;
    const newEnd = addDays(new Date(newStart), durationDays).toISOString();
    const { error } = await supabase.from("subscriptions").update({
      start_date: newStart,
      end_date: newEnd,
      status: "active",
    }).eq("id", sub.id);
    if (error) toast.error(error.message);
    else toast.success("Subscription renewed!");
  };

  const isOffline = activeStore?.store_mode === "offline";

  const onlineShortcuts = [
    { label: "New Sale", icon: Plus, path: "/pos", color: "bg-primary/10 text-primary" },
    { label: "Create Order", icon: ShoppingBag, path: "/orders", color: "bg-blue-500/10 text-blue-600" },
    { label: "Add Customer", icon: Users, path: "/customers", color: "bg-amber-500/10 text-amber-600" },
    { label: "View Orders", icon: Eye, path: "/orders", color: "bg-violet-500/10 text-violet-600" },
    { label: "Products", icon: Package, path: "/products", color: "bg-emerald-500/10 text-emerald-600" },
    { label: "POS Terminal", icon: Monitor, path: "/pos", color: "bg-rose-500/10 text-rose-600" },
    { label: "Subscriptions", icon: Repeat, path: "/subscriptions", color: "bg-cyan-500/10 text-cyan-600" },
  ];

  const offlineShortcuts = [
    { label: "POS Billing", icon: Monitor, path: "/pos", color: "bg-primary/10 text-primary" },
    { label: "Walk-in Sale", icon: Plus, path: "/pos", color: "bg-emerald-500/10 text-emerald-600" },
    { label: "View Orders", icon: Eye, path: "/orders", color: "bg-violet-500/10 text-violet-600" },
    { label: "Products", icon: Package, path: "/products", color: "bg-amber-500/10 text-amber-600" },
    { label: "Customers", icon: Users, path: "/customers", color: "bg-blue-500/10 text-blue-600" },
    { label: "Expenses", icon: Wallet, path: "/finance/income-expense", color: "bg-rose-500/10 text-rose-600" },
    { label: "Daily Sales", icon: BarChart3, path: "/finance/sales-profit", color: "bg-cyan-500/10 text-cyan-600" },
  ];

  const shortcuts = isOffline ? offlineShortcuts : onlineShortcuts;

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6">
        {/* Welcome — Premium brand header */}
        <div className="relative overflow-hidden rounded-3xl p-5 sm:p-7 text-primary-foreground shadow-[0_10px_40px_-12px_hsl(var(--primary)/0.45)] bg-[linear-gradient(135deg,hsl(var(--primary))_0%,hsl(var(--primary)/0.85)_55%,hsl(var(--primary)/0.7)_100%)]">
          {/* Decorative orbs */}
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:18px_18px]" />

          <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-primary-foreground">
                  {greeting}, <span className="text-primary-foreground">{profileName || "there"}</span>.
                </h1>
                {!isStaff && (
                  <span className="bg-white/20 backdrop-blur-sm text-primary-foreground text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-widest border border-white/25">
                    {plan} Plan
                  </span>
                )}
              </div>
              <p className="text-primary-foreground/85 text-sm mt-1.5">
                {format(new Date(), "EEEE, dd MMMM yyyy")} — {isStaff ? "Ready to assist customers today." : "Your store is looking steady."}
              </p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {isStaff && staffInfo && (
                  <Badge className="rounded-full px-2.5 py-0.5 text-[10px] bg-white/20 hover:bg-white/25 text-primary-foreground border border-white/25">
                    <Shield className="h-3 w-3 mr-1" />
                    {staffInfo.role === "admin" ? "Admin" : "Staff"}
                  </Badge>
                )}
                {activeStore && (
                  <Badge className="rounded-full px-2.5 py-0.5 text-[10px] bg-white/15 hover:bg-white/20 text-primary-foreground border border-white/20">
                    {activeStore.store_mode === "offline" ? (
                      <><MapPin className="h-3 w-3 mr-1" /> Offline Store</>
                    ) : (
                      <><Globe className="h-3 w-3 mr-1" /> Online Store</>
                    )}
                  </Badge>
                )}
                {activeStore?.name && (
                  <span className="text-xs text-primary-foreground/80 truncate">· {activeStore.name}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isStaff && (
                <Button
                  size="sm"
                  className="rounded-2xl bg-white/15 hover:bg-white/25 text-primary-foreground border border-white/25 backdrop-blur-sm shadow-none"
                  onClick={() => navigate("/finance/sales-profit")}
                >
                  <BarChart3 className="h-4 w-4 mr-1.5" /> View Reports
                </Button>
              )}
              <Button
                size="sm"
                className="rounded-2xl bg-white text-primary hover:bg-white/90 shadow-[0_4px_14px_rgba(0,0,0,0.12)]"
                onClick={() => navigate("/pos")}
              >
                <Plus className="h-4 w-4 mr-1.5" /> New Sale
              </Button>
            </div>
          </div>
        </div>

        {/* Announcement Bar - Hidden for Staff */}
        {!isStaff && (
          <div className="relative overflow-hidden rounded-2xl bg-card border border-border/60 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Megaphone className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 overflow-hidden">
                <p key={announcementIndex} className="text-sm font-medium text-foreground animate-fade-in truncate">
                  {announcements[announcementIndex]}
                </p>
              </div>
              {plan === "free" && (
                <Button size="sm" variant="outline" className="flex-shrink-0 rounded-xl text-xs" onClick={() => navigate("/my-plan")}>
                  Upgrade <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
            <div className="flex justify-center gap-1 mt-2">
              {announcements.map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === announcementIndex ? "w-4 bg-primary" : "w-1 bg-border"}`} />
              ))}
            </div>
          </div>
        )}

        {/* Profile Completion - Hidden for Staff */}
        {!isStaff && (!profileName || productCount === 0) && (
          <div className="rounded-2xl bg-primary/5 border border-primary/15 px-5 py-4 flex items-center gap-4">
            <div className="flex-shrink-0 h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Complete Your Profile</p>
              <p className="text-xs text-muted-foreground">Complete your business profile to unlock all features.</p>
            </div>
            <Button size="sm" variant="ghost" className="text-primary text-xs" onClick={() => navigate("/settings")}>
              Complete <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}

        {/* Quick Shortcuts - Bento grid */}
        <div className="rounded-3xl border border-border/60 bg-card p-5 sm:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-medium">Quick Actions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Jump straight into your most-used flows</p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 sm:grid sm:grid-cols-4 lg:grid-cols-7 sm:gap-3 sm:overflow-visible">
            {(isStaff ? shortcuts.filter(s => !["Products", "Subscriptions"].includes(s.label)) : shortcuts).map((s) => (
              <button
                key={s.label}
                onClick={() => navigate(s.path)}
                className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-2xl border border-border/50 bg-background hover:bg-muted/40 hover:border-border hover:-translate-y-0.5 transition-all group min-w-[78px] flex-shrink-0 sm:min-w-0"
              >
                <div className={`h-10 w-10 rounded-2xl ${s.color} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                  <s.icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                </div>
                <span className="text-[10px] sm:text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Expiring Subscriptions Alert */}
        {expiringUrgent.length > 0 && (
          <Card className="rounded-3xl border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 shadow-none">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                  <Bell className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base font-medium text-amber-900 dark:text-amber-200">
                    Expiring Soon · {expiringUrgent.length}
                  </CardTitle>
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/80">Subscriptions ending within 2 days</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {expiringUrgent.map(sub => {
                const daysLeft = differenceInDays(new Date(sub.end_date!), new Date());
                const hasPhone = !!sub.customers?.phone;
                return (
                  <div key={sub.id} className="flex items-center justify-between p-3 rounded-2xl bg-background border border-border/50">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{sub.customers?.name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground truncate">{sub.product_name} · {sub.variation}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <Badge variant={daysLeft === 0 ? "destructive" : "outline"} className="text-[10px]">
                        {daysLeft === 0 ? "Today" : `${daysLeft}d`}
                      </Badge>
                      {hasPhone && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => sendWhatsAppReminder(sub)} title="Send WhatsApp Reminder">
                          <MessageCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => handleQuickRenew(sub)} title="Quick Renew">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => navigate("/subscriptions")}>
                View All Subscriptions <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ========== REAL-TIME ANALYTICS (Single Source of Truth) ========== */}
        {!isStaff && showAnalytics && (
          <Suspense fallback={null}>
            <DashboardAnalytics />
          </Suspense>
        )}

        {/* Product Limit - Owner Only */}
        {!isStaff && (
          <Card className="rounded-3xl border border-border/60 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Product Limit</span>
                </div>
                <span className="text-xs text-muted-foreground">{productCount} of {productLimit} used</span>
              </div>
              <Progress value={productUsagePercent} className="h-2" />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-muted-foreground">{productUsagePercent}% used</span>
                {plan === "free" && (
                  <Button variant="default" size="sm" className="text-xs h-7 px-3" onClick={() => navigate("/my-plan")}>
                    Upgrade <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
