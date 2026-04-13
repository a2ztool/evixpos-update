import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard, RefreshCw, AlertTriangle,
  Megaphone, Plus, Eye, ShoppingBag, Monitor, Repeat,
  ChevronRight, Sparkles, CalendarDays, Users, Package,
  MessageCircle, RotateCcw, Bell, Shield, Globe, MapPin
} from "lucide-react";
import DashboardAnalytics from "@/components/DashboardAnalytics";
import { format, differenceInDays, addDays } from "date-fns";
import { toast } from "sonner";

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
  const { plan } = useSubscription();
  const navigate = useNavigate();
  const [profileName, setProfileName] = useState("");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [productCount, setProductCount] = useState(0);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  const productLimit = plan === "free" ? 25 : plan === "pro" ? 100 : 500;
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

  useEffect(() => {
    if (!user || !activeStore) return;
    const sid = activeStore.id;

    const fetchMeta = async () => {
      const [profileRes, subsRes, productsRes] = await Promise.all([
        supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
        supabase.from("subscriptions").select("id, status, price, end_date, product_name, customer_id, variation, customers(name, phone)").eq("store_id", sid),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", sid),
      ]);

      if (profileRes.data) setProfileName(profileRes.data.name);
      setSubscriptions((subsRes.data ?? []) as Subscription[]);
      setProductCount(productsRes.count ?? 0);
    };

    fetchMeta();
  }, [user, activeStore]);

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

  const shortcuts = [
    { label: "New Sale", icon: Plus, path: "/pos", color: "bg-primary/10 text-primary" },
    { label: "Create Order", icon: ShoppingBag, path: "/orders", color: "bg-blue-500/10 text-blue-600" },
    { label: "Add Customer", icon: Users, path: "/customers", color: "bg-amber-500/10 text-amber-600" },
    { label: "View Orders", icon: Eye, path: "/orders", color: "bg-violet-500/10 text-violet-600" },
    { label: "Products", icon: Package, path: "/products", color: "bg-emerald-500/10 text-emerald-600" },
    { label: "POS Terminal", icon: Monitor, path: "/pos", color: "bg-rose-500/10 text-rose-600" },
    { label: "Subscriptions", icon: Repeat, path: "/subscriptions", color: "bg-cyan-500/10 text-cyan-600" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/95 to-primary/80 p-5 sm:p-7 text-primary-foreground shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_60%)]" />
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
          <div className="absolute -left-8 -bottom-8 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <span className="text-2xl">👋</span> {greeting}, <span className="text-primary-foreground/90">{profileName || "there"}</span>
                </h1>
                <p className="text-primary-foreground/60 mt-1.5 text-xs sm:text-sm">
                  {isStaff ? "Ready to assist customers and manage your tasks! 💼" : "Ready to crush today's goals? 🚀"}
                </p>
                {isStaff && staffInfo && (
                  <div className="mt-3 flex items-center gap-2">
                    <Badge variant="secondary" className="px-2.5 py-1 backdrop-blur-sm">
                      <Shield className="h-3 w-3 mr-1" />
                      {staffInfo.role === "admin" ? "Admin" : "Staff"}
                    </Badge>
                    <span className="text-xs text-primary-foreground/60">{activeStore?.name}</span>
                  </div>
                )}
                {/* Store Mode Badge */}
                {activeStore && (
                  <div className={`mt-2 flex items-center gap-1.5 ${isStaff && staffInfo ? '' : 'mt-3'}`}>
                    <Badge variant="outline" className="backdrop-blur-sm border-primary-foreground/20 text-primary-foreground/80 text-[10px] px-2 py-0.5">
                      {activeStore.store_mode === "offline" ? (
                        <><MapPin className="h-3 w-3 mr-1" /> Offline Store</>
                      ) : (
                        <><Globe className="h-3 w-3 mr-1" /> Online Store</>
                      )}
                    </Badge>
                  </div>
                )
                )}
              </div>
              <div className="hidden sm:flex items-center gap-2">
                {!isStaff && (
                  <Badge variant="outline" className="border-primary-foreground/20 text-primary-foreground bg-primary-foreground/10 px-3 py-1.5 backdrop-blur-sm">
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                    {plan.charAt(0).toUpperCase() + plan.slice(1)} Plan
                  </Badge>
                )}
                <Badge variant="outline" className="border-primary-foreground/20 text-primary-foreground bg-primary-foreground/10 px-3 py-1.5 backdrop-blur-sm">
                  <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                  {format(new Date(), "dd MMM yyyy")}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 sm:hidden">
              {!isStaff && (
                <Badge variant="outline" className="border-primary-foreground/20 text-primary-foreground bg-primary-foreground/10 px-2 py-0.5 text-[10px]">
                  <CreditCard className="h-3 w-3 mr-1" />
                  {plan.charAt(0).toUpperCase() + plan.slice(1)}
                </Badge>
              )}
              <Badge variant="outline" className="border-primary-foreground/20 text-primary-foreground bg-primary-foreground/10 px-2 py-0.5 text-[10px]">
                <CalendarDays className="h-3 w-3 mr-1" />
                {format(new Date(), "dd MMM")}
              </Badge>
            </div>
          </div>
        </div>

        {/* Announcement Bar - Hidden for Staff */}
        {!isStaff && (
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/50 dark:border-amber-800/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Megaphone className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1 overflow-hidden">
                <p key={announcementIndex} className="text-sm font-medium text-amber-800 dark:text-amber-300 animate-fade-in truncate">
                  {announcements[announcementIndex]}
                </p>
              </div>
              {plan === "free" && (
                <Button size="sm" variant="outline" className="flex-shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 text-xs" onClick={() => navigate("/my-plan")}>
                  Upgrade <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
            <div className="flex justify-center gap-1 mt-2">
              {announcements.map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === announcementIndex ? "w-4 bg-amber-500" : "w-1 bg-amber-300/50"}`} />
              ))}
            </div>
          </div>
        )}

        {/* Profile Completion - Hidden for Staff */}
        {!isStaff && (!profileName || productCount === 0) && (
          <div className="rounded-xl bg-primary/5 border border-primary/10 px-5 py-4 flex items-center gap-4">
            <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
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

        {/* Quick Shortcuts - Staff Only See Staff-Allowed Actions */}
        <div>
          <h3 className="text-sm sm:text-base font-bold flex items-center gap-2 mb-3">
            <span className="w-1 h-5 bg-primary rounded-full inline-block" />
            Quick Actions
          </h3>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 sm:grid sm:grid-cols-4 lg:grid-cols-7 sm:gap-3 sm:overflow-visible">
            {getShortcuts(isStaff).map((s) => (
              <button
                key={s.label}
                onClick={() => navigate(s.path)}
                className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl border border-border/40 bg-card hover:bg-muted/50 hover:shadow-md transition-all group min-w-[72px] flex-shrink-0 sm:min-w-0"
              >
                <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl ${s.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <s.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <span className="text-[10px] sm:text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Expiring Subscriptions Alert */}
        {expiringUrgent.length > 0 && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Bell className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-amber-800 dark:text-amber-300">
                    ⚠️ Expiring Soon ({expiringUrgent.length})
                  </CardTitle>
                  <p className="text-xs text-amber-600 dark:text-amber-400">Subscriptions expiring within 2 days</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {expiringUrgent.map(sub => {
                const daysLeft = differenceInDays(new Date(sub.end_date!), new Date());
                const hasPhone = !!sub.customers?.phone;
                return (
                  <div key={sub.id} className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/50">
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
        {!isStaff && <DashboardAnalytics />}

        {/* Product Limit - Owner Only */}
        {!isStaff && (
          <Card className="border-border/40 shadow-sm">
            <CardContent className="p-5">
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

// Helper function to get shortcuts based on user type
const getShortcuts = (isStaff: boolean) => {
  const allShortcuts = [
    { label: "New Sale", icon: Plus, path: "/pos", color: "bg-primary/10 text-primary" },
    { label: "Create Order", icon: ShoppingBag, path: "/orders", color: "bg-blue-500/10 text-blue-600" },
    { label: "Add Customer", icon: Users, path: "/customers", color: "bg-amber-500/10 text-amber-600" },
    { label: "View Orders", icon: Eye, path: "/orders", color: "bg-violet-500/10 text-violet-600" },
    { label: "Products", icon: Package, path: "/products", color: "bg-emerald-500/10 text-emerald-600" },
    { label: "POS Terminal", icon: Monitor, path: "/pos", color: "bg-rose-500/10 text-rose-600" },
    { label: "Subscriptions", icon: Repeat, path: "/subscriptions", color: "bg-cyan-500/10 text-cyan-600" },
  ];

  if (isStaff) {
    // Staff only sees operational shortcuts, not owner-only ones
    return allShortcuts.filter(s => 
      !["Products", "Subscriptions"].includes(s.label)
    );
  }
  
  return allShortcuts;
};

export default Dashboard;
