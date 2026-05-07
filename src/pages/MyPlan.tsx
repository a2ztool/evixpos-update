import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useUsageLimits } from "@/hooks/useUsageLimits";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import PaymentModal from "@/components/PaymentModal";
import RazorpayUpgradeModal from "@/components/RazorpayUpgradeModal";
import ZinipayUpgradeModal from "@/components/ZinipayUpgradeModal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, Check, X, Crown, Zap, Shield, Star,
  Store, Users, Package, Monitor, ShoppingCart, BookOpen,
  BarChart3, RefreshCw, MessageCircle, Bot, Megaphone,
  CreditCard, Copy, Gift, Sparkles, HelpCircle, ShieldCheck,
  ChevronDown, ChevronUp, Headphones, Globe, TrendingUp,
  Calendar, Clock, Rocket, Lock, Award, BookMarked,
  PlayCircle, Lightbulb, Target, ArrowRight, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import PaymentHistory from "@/components/PaymentHistory";
import {
  VOLUME_STEPS, PRO_PRICES_INR, BUSINESS_PRICES_INR,
  formatVolume, snapToVolumeStep,
  type VolumeStep,
} from "@/lib/planConfig";
import { usePlansConfig } from "@/contexts/PlansConfigContext";

// Exchange rates from INR
const RATES_FROM_INR = { INR: 1, USD: 1 / 84, BDT: 122 / 84 };
const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", BDT: "৳", INR: "₹" };

interface PlanDef {
  name: string;
  key: string;
  color: string;
  gradient: string;
  icon: any;
  tagline: string;
  popular?: boolean;
  stores: number | string;
  products: number | string;
  features: string[];
}

const PLANS: PlanDef[] = [
  {
    name: "Free", key: "free",
    color: "text-primary", gradient: "from-primary to-primary/80",
    icon: Zap, tagline: "Lifetime",
    stores: 1, products: 25,
    features: ["POS", "Orders", "Due Book", "Reports", "Subscriptions", "POS Terminal", "Customer CRM", "Expense Tracking"],
  },
  {
    name: "Pro", key: "pro",
    color: "text-emerald-600", gradient: "from-emerald-500 to-emerald-600",
    icon: Crown, tagline: "Best for growing businesses", popular: true,
    stores: 3, products: 100,
    features: ["Everything in Free", "WhatsApp Integration", "Bot Automation", "WooCommerce Sync", "Email Notifications", "Ad Cost Tracking", "Advanced Reports", "Priority Support"],
  },
  {
    name: "Business", key: "business",
    color: "text-orange-600", gradient: "from-orange-500 to-red-500",
    icon: Shield, tagline: "For scaling teams",
    stores: 10, products: 500,
    features: ["Everything in Pro", "Multi-store Management", "Team Roles & Access", "API Access", "Custom Branding", "Bulk Operations", "Dedicated Support", "Data Export"],
  },
  {
    name: "Custom", key: "custom",
    color: "text-violet-600", gradient: "from-violet-500 to-purple-600",
    icon: Star, tagline: "For large businesses",
    stores: "Unlimited", products: "Unlimited",
    features: ["Everything in Business", "Custom Integrations", "Dedicated Account Manager", "SLA Guarantee", "On-premise Option", "White Label", "Custom Development", "Training & Onboarding"],
  },
];

/** Volume step index for slider (0-6) */
const VOLUME_INDEX_MAP = VOLUME_STEPS.map((v, i) => ({ value: i, volume: v }));

const getCompareFeatures = (vol: VolumeStep) => [
  { name: "Stores", icon: Store, free: "1", pro: "3", business: "10" },
  { name: "Customers", icon: Users, free: "50", pro: formatVolume(vol), business: formatVolume(Math.max(vol, 1000) as VolumeStep) },
  { name: "Products", icon: Package, free: "25", pro: "100", business: "500" },
  { name: "POS", icon: Monitor, free: true, pro: true, business: true },
  { name: "Orders", icon: ShoppingCart, free: true, pro: true, business: true },
  { name: "Due Book", icon: BookOpen, free: true, pro: true, business: true },
  { name: "Reports", icon: BarChart3, free: true, pro: true, business: true },
  { name: "Subscriptions", icon: RefreshCw, free: true, pro: true, business: true },
  { name: "Customer CRM", icon: Users, free: true, pro: true, business: true },
  { name: "Expense Tracking", icon: CreditCard, free: true, pro: true, business: true },
  { name: "WhatsApp Integration", icon: MessageCircle, free: false, pro: true, business: true },
  { name: "Bot Automation", icon: Bot, free: false, pro: true, business: true },
  { name: "WooCommerce Sync", icon: ShoppingCart, free: false, pro: true, business: true },
  { name: "Email Notifications", icon: MessageCircle, free: false, pro: true, business: true },
  { name: "Ad Cost Tracking", icon: Megaphone, free: false, pro: true, business: true },
  { name: "Advanced Reports", icon: BarChart3, free: false, pro: true, business: true },
  { name: "Multi-store Management", icon: Store, free: false, pro: false, business: true },
  { name: "Team Roles & Access", icon: Shield, free: false, pro: false, business: true },
  { name: "API Access", icon: Zap, free: false, pro: false, business: true },
  { name: "Custom Branding", icon: Star, free: false, pro: false, business: true },
];

interface PlatformCoupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  expires_at: string | null;
  is_active: boolean;
  max_uses: number;
  used_count: number;
}

const MyPlan = () => {
  const navigate = useNavigate();
  const WHATSAPP_NUMBER = "918101949890";
  const openWhatsApp = () => {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi, I have a question about my subscription.")}`, "_blank");
  };
  const { plan: rawPlan, volume: subVolume, endDate, remainingDays, isExpiringSoon, loading: planLoading } = useSubscription();
  const plan = rawPlan ?? "free";
  const [volumeIndex, setVolumeIndex] = useState([0]); // default index 0 = 500
  const selectedVolume = VOLUME_STEPS[volumeIndex[0]] as VolumeStep;
  const { getPriceINR, getPriceBDT, getPlanLimits: dynamicGetPlanLimits } = usePlansConfig();
  const usage = useUsageLimits(plan, subVolume);
  const currentPlan = plan.charAt(0).toUpperCase() + plan.slice(1);

  const { activeStore } = useStore();
  const { user } = useAuth();
  const [currency, setCurrency] = useState<"USD" | "BDT" | "INR">("INR");
  const [currencyDetected, setCurrencyDetected] = useState(false);

  useEffect(() => {
    if (!user || !activeStore || currencyDetected) return;
    supabase
      .from("business_settings")
      .select("default_currency")
      .eq("user_id", user.id)
      .eq("store_id", activeStore.id)
      .maybeSingle()
      .then(({ data }) => {
        const cur = (data?.default_currency || "").toUpperCase();
        if (cur === "USD" || cur === "BDT" || cur === "INR") {
          setCurrency(cur);
        }
        setCurrencyDetected(true);
      });
  }, [user, activeStore, currencyDetected]);
  const [yearly, setYearly] = useState(false);
  const [referralCode, setReferralCode] = useState<string>("");
  useEffect(() => {
    if (!user) return;
    supabase
      .from("referral_settings")
      .select("referral_code")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => { if (data?.referral_code) setReferralCode(data.referral_code); });
  }, [user]);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<PlatformCoupon | null>(null);
  const [activeBanner, setActiveBanner] = useState<PlatformCoupon | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [expandedFeatures, setExpandedFeatures] = useState<Record<string, boolean>>({});
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; planKey: string; planName: string; amount: number; volume: VolumeStep; billingType: "monthly" | "yearly" }>({
    open: false, planKey: "", planName: "", amount: 0, volume: 500 as VolumeStep, billingType: "monthly",
  });
  const [razorpayModal, setRazorpayModal] = useState<{ open: boolean; planKey: "pro" | "business"; planName: string; basePriceINR: number; volume: VolumeStep; billingType: "monthly" | "yearly" }>({
    open: false, planKey: "pro", planName: "", basePriceINR: 0, volume: 500 as VolumeStep, billingType: "monthly",
  });
  const [zinipayModal, setZinipayModal] = useState<{ open: boolean; planKey: "pro" | "business"; planName: string; basePriceBDT: number; volume: VolumeStep; billingType: "monthly" | "yearly" }>({
    open: false, planKey: "pro", planName: "", basePriceBDT: 0, volume: 500 as VolumeStep, billingType: "monthly",
  });
  const [processingPlanKey, setProcessingPlanKey] = useState<string | null>(null);
  const [razorpayEnabled, setRazorpayEnabled] = useState(false);
  const [zinipayEnabled, setZinipayEnabled] = useState(false);

  // Watch admin-controlled Razorpay gateway toggle (INR + automatic mode)
  useEffect(() => {
    const fetchFlag = async () => {
      const { data } = await supabase.rpc("get_active_payment_gateways", { _currency: "INR" });
      const list = (data as any[]) || [];
      setRazorpayEnabled(list.some((g) => String(g.gateway_name).toLowerCase() === "razorpay"));
    };
    fetchFlag();
    const ch = supabase
      .channel("razorpay-flag")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_gateways" }, fetchFlag)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Watch admin-controlled ZiniPay gateway toggle (BDT)
  useEffect(() => {
    const fetchFlag = async () => {
      const { data } = await supabase.rpc("get_active_payment_gateways", { _currency: "BDT" });
      const list = (data as any[]) || [];
      setZinipayEnabled(list.some((g) => String(g.gateway_name).toLowerCase() === "zinipay"));
    };
    fetchFlag();
    const ch = supabase
      .channel("zinipay-flag")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_gateways" }, fetchFlag)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleUpgrade = async (planDef: PlanDef) => {
    const priceINR = getINRPrice(planDef.key);
    if (priceINR === null || priceINR === 0) return;
    let monthlyPrice = priceINR * RATES_FROM_INR[currency];
    let price = yearly ? monthlyPrice * 12 * 0.8 : monthlyPrice;
    if (discountPct > 0) price = price * (1 - discountPct / 100);
    if (discountFixed > 0) price = Math.max(0, price - discountFixed);

    // INR + Razorpay enabled by admin → coupon-first checkout modal. Otherwise → manual gateway modal.
    if (currency === "INR" && razorpayEnabled && (planDef.key === "pro" || planDef.key === "business")) {
      if (!user) { toast.error("Please log in to upgrade"); return; }
      // Base INR price for the backend (yearly already includes 20% discount, no platform-coupon yet).
      // Round to whole rupees so UI exactly matches server-side computation.
      const baseInr = Math.round(yearly ? priceINR * 12 * 0.8 : priceINR);
      setRazorpayModal({
        open: true,
        planKey: planDef.key as "pro" | "business",
        planName: planDef.name,
        basePriceINR: baseInr,
        volume: selectedVolume,
        billingType: yearly ? "yearly" : "monthly",
      });
      return;
    }

    // BDT + ZiniPay enabled by admin → ZiniPay redirect-based checkout
    if (currency === "BDT" && zinipayEnabled && (planDef.key === "pro" || planDef.key === "business")) {
      if (!user) { toast.error("Please log in to upgrade"); return; }
      const priceBdt = getPriceBDT(planDef.key, selectedVolume);
      const baseBdt = Math.round(yearly ? priceBdt * 12 * 0.8 : priceBdt);
      setZinipayModal({
        open: true,
        planKey: planDef.key as "pro" | "business",
        planName: planDef.name,
        basePriceBDT: baseBdt,
        volume: selectedVolume,
        billingType: yearly ? "yearly" : "monthly",
      });
      return;
    }

    setPaymentModal({
      open: true,
      planKey: planDef.key,
      planName: planDef.name,
      amount: Math.round(price * 100) / 100,
      volume: selectedVolume,
      billingType: yearly ? "yearly" : "monthly",
    });
  };

  // Fetch active coupons for banner
  useEffect(() => {
    supabase.rpc("get_active_coupon_banner").then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setActiveBanner(row as unknown as PlatformCoupon);
    });
  }, []);

  // Countdown timer for special offer
  const [timeLeft, setTimeLeft] = useState({ days: 2, hours: 16, mins: 43, secs: 22 });
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        let { days, hours, mins, secs } = prev;
        secs--;
        if (secs < 0) { secs = 59; mins--; }
        if (mins < 0) { mins = 59; hours--; }
        if (hours < 0) { hours = 23; days--; }
        if (days < 0) return { days: 0, hours: 0, mins: 0, secs: 0 };
        return { days, hours, mins, secs };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const discountPct = appliedCoupon?.discount_type === "percentage" ? appliedCoupon.discount_value : 0;
  const discountFixed = appliedCoupon?.discount_type === "fixed" ? appliedCoupon.discount_value : 0;

  /** Get INR price for a plan based on selected volume */
  const getINRPrice = (planKey: string): number | null => {
    if (planKey === "free") return 0;
    if (planKey === "custom") return null;
    return getPriceINR(planKey, selectedVolume);
  };

  const formatPrice = (planKey: string) => {
    const inr = getINRPrice(planKey);
    if (inr === null) return "Custom";
    if (inr === 0) return "Free";
    let price: number;
    if (currency === "BDT") {
      // Use BDT price directly from plans_config so UI matches server/checkout
      price = getPriceBDT(planKey, selectedVolume);
    } else {
      price = inr * RATES_FROM_INR[currency];
    }
    if (yearly) price = price * 12 * 0.8; // yearly = monthly × 12 × 0.8
    if (discountPct > 0) price = price * (1 - discountPct / 100);
    if (discountFixed > 0) price = Math.max(0, price - discountFixed);
    return `${CURRENCY_SYMBOLS[currency]}${price.toFixed(currency === "USD" ? 2 : 0)}`;
  };

  const originalPrice = (planKey: string) => {
    const inr = getINRPrice(planKey);
    if (inr === null || inr === 0) return null;
    const base =
      currency === "BDT"
        ? getPriceBDT(planKey, selectedVolume)
        : inr * RATES_FROM_INR[currency];
    const price = yearly ? base * 12 : base;
    return `${CURRENCY_SYMBOLS[currency]}${price.toFixed(currency === "USD" ? 2 : 0)}`;
  };

  const hasDiscount = (planKey: string) => {
    const inr = getINRPrice(planKey);
    if (inr === null || inr === 0) return false;
    return yearly || discountPct > 0 || discountFixed > 0;
  };

  const applyCoupon = async () => {
    const code = couponCode.toUpperCase().trim();
    if (!code) return;

    const { data: rows } = await supabase.rpc("validate_platform_coupon", { _code: code });
    const data = Array.isArray(rows) ? rows[0] : rows;
    if (!data) {
      toast.error("Invalid or expired coupon code");
      return;
    }

    const coupon = data as unknown as PlatformCoupon;

    // Check expiry
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      toast.error("This coupon has expired");
      return;
    }

    // Check usage limit
    if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
      toast.error("This coupon has reached its usage limit");
      return;
    }

    setAppliedCoupon(coupon);
    const label = coupon.discount_type === "percentage"
      ? `${coupon.discount_value}% OFF`
      : `${CURRENCY_SYMBOLS[currency]}${coupon.discount_value} OFF`;
    toast.success(`Coupon ${code} applied! ${label} on your next purchase.`);
  };

  const volumeLabel = useMemo(() => formatVolume(selectedVolume), [selectedVolume]);

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-7 max-w-6xl mx-auto">
        {/* Premium Hero + Active Plan Card */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
          {/* Hero */}
          <div className="lg:col-span-3 relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5 sm:p-7">
            <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
            <div className="relative space-y-2">
              <Badge className="bg-primary/15 text-primary border-0 hover:bg-primary/20 gap-1.5">
                <Sparkles className="h-3 w-3" /> Packages & Subscription
              </Badge>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Grow your business with the right plan
              </h1>
              <p className="text-sm text-muted-foreground">
                Flexible volume-based pricing. Upgrade, downgrade or cancel anytime — pay only for what you use.
              </p>
            </div>
          </div>

          {/* Active Plan Card */}
          <Card className="lg:col-span-2 border-border/50 bg-gradient-to-br from-background to-muted/30">
            <CardContent className="p-5 sm:p-6 flex flex-col h-full gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Crown className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-base truncate">{currentPlan} Plan</p>
                      {isExpiringSoon ? (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0 text-[10px] px-1.5 py-0">Expiring</Badge>
                      ) : (
                        <Badge className="bg-success/15 text-success border-0 text-[10px] px-1.5 py-0">Active</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {endDate ? `Expires ${new Date(endDate).toLocaleDateString()}` : plan === "free" ? "Lifetime access" : "Active"}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Days left</div>
                  <div className="text-lg font-bold text-primary leading-tight">{endDate ? remainingDays : "∞"}</div>
                </div>
              </div>

              <div className="space-y-2.5">
                {[
                  { label: "Stores", icon: Store, current: usage.totalStores, max: usage.maxStores },
                  { label: "Customers", icon: Users, current: usage.totalCustomers, max: usage.maxCustomers },
                  { label: "Products", icon: Package, current: usage.totalProducts, max: usage.maxProducts },
                ].map((item) => {
                  const unlimited = !isFinite(item.max);
                  const pct = unlimited ? 0 : (item.max > 0 ? Math.min((item.current / item.max) * 100, 100) : 0);
                  const isHigh = !unlimited && pct >= 80;
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <item.icon className="h-3 w-3" />
                          {item.label}
                        </span>
                        <span className={`font-semibold ${isHigh ? "text-destructive" : "text-foreground"}`}>
                          {usage.loading ? "…" : unlimited ? `${item.current} / ∞` : `${item.current} / ${item.max}`}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isHigh ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Guide Section */}
        <Card className="border-border/50 bg-gradient-to-br from-background to-muted/30">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lightbulb className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-base">How to choose the right plan</h3>
                <p className="text-xs text-muted-foreground">4 simple steps to pick the perfect package</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { n: 1, icon: Target, title: "Estimate volume", desc: "Use the slider to set your monthly customer volume.", color: "bg-blue-500/10 text-blue-600" },
                { n: 2, icon: BarChart3, title: "Compare features", desc: "Review the feature matrix to find what you need.", color: "bg-emerald-500/10 text-emerald-600" },
                { n: 3, icon: Calendar, title: "Pick billing", desc: "Save 20% with yearly billing on any plan.", color: "bg-orange-500/10 text-orange-600" },
                { n: 4, icon: Rocket, title: "Upgrade & grow", desc: "Apply a coupon and start instantly.", color: "bg-violet-500/10 text-violet-600" },
              ].map((step) => (
                <div key={step.n} className="relative rounded-xl border border-border/50 bg-background p-3 hover:border-primary/30 hover:shadow-sm transition-all">
                  <div className="absolute -top-2 -left-2 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-sm">
                    {step.n}
                  </div>
                  <div className={`h-8 w-8 rounded-lg ${step.color} flex items-center justify-center mb-2`}>
                    <step.icon className="h-4 w-4" />
                  </div>
                  <p className="font-semibold text-sm">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Special Offer Banner — merged with coupon */}
        <div
          className="relative overflow-hidden rounded-2xl text-white p-4 sm:p-6 shadow-xl bg-gradient-to-br from-primary via-primary to-emerald-700 bg-[length:200%_200%] animate-shimmer-gradient ring-1 ring-primary/30"
          style={{ boxShadow: "0 12px 40px -12px hsl(var(--primary) / 0.55)" }}
        >
          {/* Soft brand glows */}
          <div className="absolute -top-24 -left-16 h-64 w-64 rounded-full bg-white/15 blur-3xl pointer-events-none animate-float" />
          <div className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl pointer-events-none animate-float" style={{ animationDelay: "1.2s" }} />
          {/* Shimmer sweep */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-12 animate-shimmer" />
          </div>
          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5">
            {/* Left: Offer + coupon */}
            <div className="flex flex-col gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-white/95 text-primary text-[11px] sm:text-xs font-bold px-2.5 py-1 shadow-md animate-pulse-glow rounded-full">
                  <Sparkles className="h-3 w-3 mr-1 animate-pulse" /> Special Offer
                </Badge>
                <span className="text-xs sm:text-sm text-white/90">Limited-time pricing on Pro & Business plans</span>
              </div>
              {activeBanner && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl px-3 py-2 shadow-sm">
                    <Gift className="h-4 w-4 text-amber-200 shrink-0 animate-pulse" />
                    <span className="text-[11px] sm:text-xs text-white/80">Use code</span>
                    <code className="bg-white text-primary px-2 py-0.5 rounded-md font-mono font-extrabold text-xs sm:text-sm tracking-wider shadow-sm">{activeBanner.code}</code>
                    <span className="text-[11px] sm:text-xs font-semibold text-amber-200">
                      {activeBanner.discount_type === "percentage" ? `${activeBanner.discount_value}% OFF` : `${CURRENCY_SYMBOLS[currency]}${activeBanner.discount_value} OFF`}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-white text-primary border-white hover:bg-white/90 hover:text-primary gap-1.5 w-full sm:w-auto font-semibold shadow-md transition-transform active:scale-95 hover:scale-[1.02]"
                    onClick={() => {
                      navigator.clipboard.writeText(activeBanner.code);
                      toast.success(`Coupon ${activeBanner.code} copied! Apply at checkout.`);
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy code
                  </Button>
                  <span className="text-[11px] text-white/70 sm:ml-1">Apply at checkout</span>
                </div>
              )}
            </div>
            {/* Right: Countdown */}
            <div className="flex flex-col items-start lg:items-end gap-1.5 shrink-0">
              <span className="text-[10px] sm:text-[11px] text-white/70 uppercase tracking-widest font-semibold">Expires in</span>
              <div className="flex gap-1.5">
                {[
                  { val: timeLeft.days, label: "Days" },
                  { val: timeLeft.hours, label: "Hours" },
                  { val: timeLeft.mins, label: "Mins" },
                  { val: timeLeft.secs, label: "Secs" },
                ].map((t) => (
                  <div key={t.label} className="bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl px-2.5 py-1.5 text-center min-w-[42px] sm:min-w-[48px] shadow-sm">
                    <span className="text-white font-extrabold text-base sm:text-xl block leading-none tabular-nums">{String(t.val).padStart(2, "0")}</span>
                    <span className="text-[9px] text-white/70 uppercase tracking-wide">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Global Usage Summary */}
        {!usage.loading && (
          <Card className="border-border/50">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Usage Summary (All Stores)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Stores", current: usage.totalStores, max: usage.maxStores, icon: Store },
                  { label: "Products", current: usage.totalProducts, max: usage.maxProducts, icon: Package },
                  { label: "Customers", current: usage.totalCustomers, max: usage.maxCustomers, icon: Users },
                ].map((item) => {
                  const unlimited = !isFinite(item.max);
                  const pct = unlimited ? 0 : (item.max > 0 ? Math.min((item.current / item.max) * 100, 100) : 0);
                  const isHigh = !unlimited && pct >= 80;
                  return (
                    <div key={item.label} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <item.icon className="h-3.5 w-3.5" />
                          {item.label}
                        </span>
                        <span className={`font-semibold ${isHigh ? "text-destructive" : "text-foreground"}`}>
                          {unlimited ? `${item.current} / ∞` : `${item.current} / ${item.max}`}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isHigh ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Per-store breakdown */}
              {usage.perStore.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Per Store Breakdown</p>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3 font-medium">Store</th>
                          <th className="text-center py-2 px-3 font-medium">Products</th>
                          <th className="text-center py-2 px-3 font-medium">Customers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.perStore.map((s) => (
                          <tr key={s.storeId} className="border-b last:border-0">
                            <td className="py-2 px-3">{s.storeName}</td>
                            <td className="text-center py-2 px-3">{s.products}</td>
                            <td className="text-center py-2 px-3">{s.customers}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/30 font-medium">
                          <td className="py-2 px-3">Total</td>
                          <td className="text-center py-2 px-3">{usage.totalProducts}</td>
                          <td className="text-center py-2 px-3">{usage.totalCustomers}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Volume Selector — modern SaaS card */}
        <Card className="overflow-hidden border-border/60 bg-card shadow-sm">
          <CardContent className="p-0">
            {/* Header strip */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border/60 bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm sm:text-base text-foreground">Customer volume</h3>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      Auto-priced
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pick your monthly customer capacity — price scales with usage.
                  </p>
                </div>
              </div>
              {/* Currency segmented control */}
              <div className="inline-flex items-center p-0.5 rounded-lg bg-background border border-border/60 self-start sm:self-auto">
                {(["BDT", "USD", "INR"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-md transition-all ${
                      currency === c
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {CURRENCY_SYMBOLS[c]} {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="px-4 sm:px-6 py-5 space-y-4">
              {/* Stat row */}
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    Selected capacity
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight tabular-nums">
                      {volumeLabel}
                    </span>
                    <span className="text-sm text-muted-foreground">customers / mo</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    Exchange rate
                  </div>
                  <div className="text-xs text-foreground/80 font-medium mt-1 tabular-nums">
                    1 INR ≈ {RATES_FROM_INR.BDT.toFixed(2)} BDT · {RATES_FROM_INR.USD.toFixed(4)} USD
                  </div>
                </div>
              </div>

              {/* Slider */}
              <div className="pt-1">
                <Slider
                  value={volumeIndex}
                  onValueChange={setVolumeIndex}
                  min={0}
                  max={VOLUME_STEPS.length - 1}
                  step={1}
                  className="[&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&_[role=slider]]:border-2 [&_[role=slider]]:border-primary [&_[role=slider]]:bg-background [&_[role=slider]]:shadow-md [&_[role=slider]]:ring-4 [&_[role=slider]]:ring-primary/15 [&>span:first-child]:h-1.5 [&>span:first-child]:bg-muted [&>span:first-child>span]:bg-primary"
                />
              </div>

              {/* Preset segmented control */}
              <div className="grid grid-cols-7 gap-1 p-1 rounded-lg bg-muted/40 border border-border/40">
                {["500", "1K", "5K", "10K", "20K", "50K", "100K"].map((l, i) => {
                  const active = volumeIndex[0] === i;
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setVolumeIndex([i])}
                      className={`text-[11px] sm:text-xs font-semibold py-1.5 rounded-md transition-all ${
                        active
                          ? "bg-background text-primary shadow-sm ring-1 ring-primary/20"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monthly / Yearly Toggle */}
        <div className="flex justify-center items-center gap-2 sm:gap-3 sticky top-14 sm:static z-20 sm:z-auto py-2 sm:py-0 -mx-3 px-3 sm:mx-0 sm:px-0 bg-background/85 sm:bg-transparent backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:supports-[backdrop-filter]:bg-transparent sm:backdrop-blur-0 rounded-full sm:rounded-none">
          <Button
            variant={!yearly ? "default" : "outline"}
            size="sm"
            onClick={() => setYearly(false)}
            className="rounded-full px-4 sm:px-6 h-8 sm:h-9 text-xs sm:text-sm"
          >
            Monthly
          </Button>
          <Button
            variant={yearly ? "default" : "outline"}
            size="sm"
            onClick={() => setYearly(true)}
            className="rounded-full px-4 sm:px-6 h-8 sm:h-9 text-xs sm:text-sm"
          >
            Yearly
          </Button>
          {yearly && (
            <Badge variant="outline" className="text-success border-success/30 text-[10px] sm:text-xs px-1.5 sm:px-2.5">
              Save 20%
            </Badge>
          )}
        </div>

        {/* Plan Cards — Premium SaaS Style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 items-stretch">
          {PLANS.map((p) => {
            const isActive = p.name === currentPlan;
            const Icon = p.icon;
            const priceINR = getINRPrice(p.key);
            const monthlySavings = yearly && priceINR && priceINR > 0
              ? Math.round(priceINR * RATES_FROM_INR[currency] * 12 * 0.2)
              : 0;
            const showAllFeatures = !!expandedFeatures[p.key];
            return (
              <Card
                key={p.name}
                className={`group relative overflow-hidden border-border/50 transition-all duration-300 sm:hover:-translate-y-1 sm:hover:shadow-xl active:scale-[0.99] sm:active:scale-100 flex flex-col h-full bg-gradient-to-br from-background to-muted/20 sm:bg-none ${
                  p.popular ? "ring-2 ring-primary shadow-lg shadow-primary/10" : ""
                }`}
              >
                {/* Gradient top accent */}
                <div className={`h-1 sm:h-1.5 w-full bg-gradient-to-r ${p.gradient}`} />

                {/* Glow on popular */}
                {p.popular && (
                  <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
                )}

                {isActive && (
                  <Badge className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-success text-success-foreground text-[9px] sm:text-[10px] z-10 shadow-sm px-1.5 py-0">
                    <Check className="h-2.5 w-2.5 mr-0.5" /> ACTIVE
                  </Badge>
                )}
                {p.popular && !isActive && (
                  <Badge className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-[9px] sm:text-[10px] z-10 shadow-sm px-1.5 py-0">
                    <Star className="h-2.5 w-2.5 mr-0.5 fill-current" /> POPULAR
                  </Badge>
                )}

                <CardContent className="p-3.5 sm:p-6 relative flex flex-col flex-1">
                  {/* Icon + Name */}
                  <div className="flex items-center gap-2 sm:gap-2.5 mb-1">
                    <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl bg-gradient-to-br ${p.gradient} flex items-center justify-center shadow-sm`}>
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
                    </div>
                    <div>
                      <div className={`${p.color} font-bold text-sm sm:text-base leading-none`}>{p.name}</div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{p.tagline}</p>
                    </div>
                  </div>

                  {/* Price */}
                  {(() => {
                    if (priceINR === 0) return (
                      <div className="my-3 sm:my-4 pb-2.5 sm:pb-3 border-b border-border/50">
                        <span className={`text-2xl sm:text-3xl font-bold ${p.color}`}>Free</span>
                        <span className="text-xs sm:text-sm text-muted-foreground ml-1">forever</span>
                      </div>
                    );
                    if (priceINR === null) return (
                      <div className="my-3 sm:my-4 pb-2.5 sm:pb-3 border-b border-border/50">
                        <span className={`text-2xl sm:text-3xl font-bold ${p.color}`}>Custom</span>
                        <p className="text-xs text-muted-foreground mt-1">Tailored pricing</p>
                      </div>
                    );
                    return (
                      <div className="my-3 sm:my-4 pb-2.5 sm:pb-3 border-b border-border/50">
                        <div className="flex items-baseline gap-1.5">
                          {hasDiscount(p.key) && (
                            <span className="text-[11px] sm:text-xs text-muted-foreground line-through">
                              {originalPrice(p.key)}
                            </span>
                          )}
                          <span className={`text-2xl sm:text-3xl font-bold ${p.color} leading-none`}>
                            {formatPrice(p.key)}
                          </span>
                          <span className="text-[11px] sm:text-xs text-muted-foreground">{yearly ? "/yr" : "/mo"}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-1.5 sm:mt-2">
                          {yearly && (
                            <Badge variant="outline" className="text-success border-success/30 text-[10px] py-0 px-1.5">20% OFF</Badge>
                          )}
                          {discountPct > 0 && (
                            <Badge variant="outline" className="text-success border-success/30 text-[10px] py-0 px-1.5">{discountPct}% OFF</Badge>
                          )}
                          {discountFixed > 0 && (
                            <Badge variant="outline" className="text-success border-success/30 text-[10px] py-0 px-1.5">{CURRENCY_SYMBOLS[currency]}{discountFixed} OFF</Badge>
                          )}
                          {monthlySavings > 0 && (
                            <span className="text-[10px] text-success font-medium">
                              Save {CURRENCY_SYMBOLS[currency]}{monthlySavings}/yr
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> {yearly ? "365" : "30"} days access
                        </p>
                      </div>
                    );
                  })()}

                  {/* Limits chips */}
                  <div className="space-y-1 sm:space-y-1.5 mb-3 sm:mb-4 flex-1">
                    {[
                      { icon: Store, label: `${p.stores} ${typeof p.stores === "number" && p.stores > 1 ? "stores" : "store"}` },
                      { icon: Users, label: `${p.key === "free" ? "50" : p.key === "custom" ? "Unlimited" : p.key === "business" ? formatVolume(Math.max(selectedVolume, 1000) as VolumeStep) : formatVolume(selectedVolume)} customers` },
                      { icon: Package, label: `${p.products} products` },
                    ].map((l) => (
                      <div key={l.label} className="flex items-center gap-2 text-[11px] sm:text-xs">
                        <l.icon className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-foreground/80">{l.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  {isActive ? (
                    <Button variant="outline" className="w-full gap-1.5 rounded-full sm:rounded-md h-9 sm:h-10 text-xs sm:text-sm" disabled>
                      <Check className="h-3.5 w-3.5" /> Current Plan
                    </Button>
                  ) : priceINR === null ? (
                    <Button variant="outline" className="w-full gap-1.5 rounded-full sm:rounded-md h-9 sm:h-10 text-xs sm:text-sm active:scale-[0.97] transition-transform" onClick={() => navigate("/support")}>
                      <Headphones className="h-3.5 w-3.5" /> Contact Sales
                    </Button>
                  ) : (
                    <Button
                      className={`w-full bg-gradient-to-r ${p.gradient} text-white shadow-sm hover:shadow-md gap-1.5 group/btn rounded-full sm:rounded-md h-9 sm:h-10 text-xs sm:text-sm active:scale-[0.97] transition-transform`}
                      onClick={() => handleUpgrade(p)}
                      disabled={processingPlanKey === p.key}
                    >
                      {processingPlanKey === p.key ? (
                        <>Processing…</>
                      ) : (
                        <>
                          {priceINR === 0 ? "Get Started" : "Upgrade Now"}
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
                        </>
                      )}
                    </Button>
                  )}

                  {/* Mini features preview */}
                  <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-border/50 space-y-1 sm:space-y-1.5">
                    {(showAllFeatures ? p.features : p.features.slice(0, 3)).map((f) => (
                      <div key={f} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <Check className="h-3 w-3 text-success shrink-0 mt-0.5" />
                        <span className="leading-snug">{f}</span>
                      </div>
                    ))}
                    {p.features.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setExpandedFeatures((s) => ({ ...s, [p.key]: !s[p.key] }))}
                        className="text-[10px] text-primary font-medium pt-0.5 hover:underline text-left"
                      >
                        {showAllFeatures ? "Show less" : `+ ${p.features.length - 3} more features`}
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Trust strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: ShieldCheck, title: "7-day refund", desc: "Money-back" },
            { icon: Lock, title: "Secure pay", desc: "256-bit SSL" },
            { icon: Award, title: "5,000+ stores", desc: "Trusted" },
            { icon: RefreshCw, title: "Cancel anytime", desc: "No lock-in" },
          ].map((t) => (
            <div key={t.title} className="flex items-center gap-2.5 p-3 rounded-xl border border-border/50 bg-muted/20">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <t.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{t.title}</p>
                <p className="text-[10px] text-muted-foreground truncate">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>


        {/* Features of Current Plan */}
        <Card className="border-border/50">
          <CardContent className="p-5 sm:p-6">
            <h3 className="font-bold text-lg mb-4">
              <span className="text-primary">🔥</span> {currentPlan} <span className="font-normal">Features of</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(PLANS.find((p) => p.name === currentPlan) ?? PLANS[0]).features.map((f) => (
                <div key={f} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                  <Check className="h-4 w-4 text-success flex-shrink-0" />
                  <span className="text-sm">{f}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>


        {/* Compare Features Table */}
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <h3 className="text-center font-bold text-xl mb-1">Compare Features</h3>
            <p className="text-center text-sm text-muted-foreground mb-6">
              See exactly what's included in each plan to find your perfect fit.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">FEATURE</th>
                    <th className="text-center py-3 px-4">
                      <div className="flex flex-col items-center gap-1">
                        <Zap className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold">FREE</span>
                      </div>
                    </th>
                    <th className="text-center py-3 px-4">
                      <div className="flex flex-col items-center gap-1">
                        <Crown className="h-4 w-4 text-emerald-600" />
                        <span className="text-xs font-bold text-emerald-600">PRO</span>
                      </div>
                    </th>
                    <th className="text-center py-3 px-4">
                      <div className="flex flex-col items-center gap-1">
                        <Shield className="h-4 w-4 text-orange-600" />
                        <span className="text-xs font-bold text-orange-600">BUSINESS</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getCompareFeatures(selectedVolume).map((f, i) => {
                    const Icon = f.icon;
                    return (
                      <tr key={f.name} className={`border-b border-border/50 ${i % 2 === 0 ? "bg-muted/20" : ""}`}>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{f.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {typeof f.free === "boolean" ? (
                            f.free ? <Check className="h-4 w-4 text-success mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                          ) : (
                            <span className="text-sm font-semibold">{f.free}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {typeof f.pro === "boolean" ? (
                            f.pro ? <Check className="h-4 w-4 text-success mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                          ) : (
                            <span className="text-sm font-semibold">{f.pro}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {typeof f.business === "boolean" ? (
                            f.business ? <Check className="h-4 w-4 text-success mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                          ) : (
                            <span className="text-sm font-semibold">{f.business}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Using Plan Bar */}
            <div className="mt-6 text-center py-3 rounded-xl bg-muted/50">
              <span className="text-muted-foreground text-sm">Using <span className="font-semibold">{currentPlan}</span></span>
            </div>
          </CardContent>
        </Card>

        {/* Money-Back Guarantee */}
        <Card className="border-border/50 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">7-Day Money-Back Guarantee</h3>
              <p className="text-sm text-muted-foreground">Try any plan risk-free. Not satisfied? Get a full refund within 7 days — no questions asked.</p>
            </div>
          </CardContent>
        </Card>

        {/* Referral CTA */}
        <Card className="border-border/50">
          <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="h-14 w-14 rounded-2xl bg-success/10 flex items-center justify-center flex-shrink-0">
              <Gift className="h-7 w-7 text-success" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">Invite Friends & Earn 20% Commission</h3>
              <p className="text-sm text-muted-foreground">Share your referral link. Earn 20% recurring commission for every friend who upgrades to a paid plan.</p>
            </div>
            <Button variant="outline" className="gap-2 flex-shrink-0" onClick={() => { const link = referralCode ? `https://evixpos.com/auth?tab=signup&ref=${referralCode}` : "https://evixpos.com"; navigator.clipboard.writeText(link); toast.success("Referral link copied!"); }}>
              <Copy className="h-4 w-4" /> Copy Link
            </Button>
          </CardContent>
        </Card>

        {/* FAQ Section */}
        <Card className="border-border/50">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-6">
              <HelpCircle className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-xl">Frequently Asked Questions</h3>
            </div>
            {[
              { q: "Can I change my plan anytime?", a: "Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately." },
              { q: "What happens when I reach my store limit?", a: "You'll see a notification to upgrade. Your existing stores and data remain safe — you just can't add new ones until you upgrade." },
              { q: "How does volume-based pricing work?", a: "Use the slider to select your expected monthly customers & orders volume. The price adjusts automatically. You only pay for what you need." },
              { q: "Is there a free trial for paid plans?", a: "We offer a 7-day money-back guarantee on all paid plans. Try risk-free!" },
              { q: "What payment methods do you accept?", a: "We accept bKash, Nagad, bank transfer, and international cards (Visa/Mastercard). Contact support for alternative methods." },
              { q: "Can I get a custom plan for my business?", a: "Absolutely! Contact our sales team for a tailored plan with custom limits, features, and dedicated support." },
            ].map((faq, i) => (
              <div key={i} className="border-b border-border/50 last:border-0">
                <button
                  className="w-full flex items-center justify-between py-4 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-medium text-sm pr-4">{faq.q}</span>
                  {openFaq === i ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                </button>
                {openFaq === i && (
                  <p className="pb-4 text-sm text-muted-foreground -mt-1 pr-8">{faq.a}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Enterprise CTA */}
        <Card className="border-border/50 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20">
          <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="h-14 w-14 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
              <Globe className="h-7 w-7 text-violet-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">Need a Custom Enterprise Plan?</h3>
              <p className="text-sm text-muted-foreground">Unlimited stores, custom integrations, SLA, and dedicated support for large-scale operations.</p>
            </div>
            <Button
              variant="outline"
              className="gap-2 flex-shrink-0 border-violet-300 text-violet-700 dark:text-violet-400"
              onClick={() => navigate("/support")}
            >
              <Headphones className="h-4 w-4" /> Contact Sales
            </Button>
          </CardContent>
        </Card>

        {/* Payment History */}
        <div className="pt-2">
          <PaymentHistory />
        </div>
      </div>


      <PaymentModal
        open={paymentModal.open}
        onOpenChange={(open) => setPaymentModal(prev => ({ ...prev, open }))}
        planKey={paymentModal.planKey}
        planName={paymentModal.planName}
        amount={paymentModal.amount}
        currency={currency}
        currencySymbol={CURRENCY_SYMBOLS[currency]}
        billingType={paymentModal.billingType}
        volume={paymentModal.volume}
      />

      <RazorpayUpgradeModal
        open={razorpayModal.open}
        onOpenChange={(open) => setRazorpayModal(prev => ({ ...prev, open }))}
        planKey={razorpayModal.planKey}
        planName={razorpayModal.planName}
        volume={razorpayModal.volume}
        billingType={razorpayModal.billingType}
        basePriceINR={razorpayModal.basePriceINR}
      />

      <ZinipayUpgradeModal
        open={zinipayModal.open}
        onOpenChange={(open) => setZinipayModal(prev => ({ ...prev, open }))}
        planKey={zinipayModal.planKey}
        planName={zinipayModal.planName}
        volume={zinipayModal.volume}
        billingType={zinipayModal.billingType}
        basePriceBDT={zinipayModal.basePriceBDT}
      />
    </DashboardLayout>
  );
};

export default MyPlan;
