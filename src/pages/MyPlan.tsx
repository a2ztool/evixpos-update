import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useUsageLimits } from "@/hooks/useUsageLimits";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import PaymentModal from "@/components/PaymentModal";
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
  ChevronDown, ChevronUp, Headphones, Globe
} from "lucide-react";
import { toast } from "sonner";
import PaymentHistory from "@/components/PaymentHistory";

// Exchange rates: 1 USD
const RATES = { USD: 1, BDT: 122, INR: 84 };
const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", BDT: "৳", INR: "₹" };

interface PlanDef {
  name: string;
  key: string;
  color: string;
  gradient: string;
  baseUSD: number | null;
  ratePerUnit: number; // USD per 1K volume above base
  baseVolume: number; // included volume
  icon: any;
  tagline: string;
  popular?: boolean;
  stores: number | string;
  customers: number | string;
  products: number | string;
  features: string[];
}

const formatVolume = (v: number) => {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  return v.toLocaleString();
};


const PLANS: PlanDef[] = [
  {
    name: "Free", key: "free",
    color: "text-primary", gradient: "from-primary to-primary/80",
    baseUSD: 0, ratePerUnit: 0, baseVolume: 500,
    icon: Zap, tagline: "Lifetime",
    stores: 1, customers: 50, products: 25,
    features: ["POS", "Orders", "Due Book", "Reports", "Subscriptions", "POS Terminal", "Customer CRM", "Expense Tracking"],
  },
  {
    name: "Pro", key: "pro",
    color: "text-emerald-600", gradient: "from-emerald-500 to-emerald-600",
    baseUSD: 2.49, ratePerUnit: 0.50, baseVolume: 500,
    icon: Crown, tagline: "Best for growing businesses", popular: true,
    stores: 3, customers: "volume", products: 100,
    features: ["Everything in Free", "WhatsApp Integration", "Bot Automation", "WooCommerce Sync", "Email Notifications", "Ad Cost Tracking", "Advanced Reports", "Priority Support"],
  },
  {
    name: "Business", key: "business",
    color: "text-orange-600", gradient: "from-orange-500 to-red-500",
    baseUSD: 4.99, ratePerUnit: 0.30, baseVolume: 500,
    icon: Shield, tagline: "For scaling teams",
    stores: 10, customers: "volume", products: 500,
    features: ["Everything in Pro", "Multi-store Management", "Team Roles & Access", "API Access", "Custom Branding", "Bulk Operations", "Dedicated Support", "Data Export"],
  },
  {
    name: "Custom", key: "custom",
    color: "text-violet-600", gradient: "from-violet-500 to-purple-600",
    baseUSD: null, ratePerUnit: 0, baseVolume: 0,
    icon: Star, tagline: "For large businesses",
    stores: "Unlimited", customers: "Unlimited", products: "Unlimited",
    features: ["Everything in Business", "Custom Integrations", "Dedicated Account Manager", "SLA Guarantee", "On-premise Option", "White Label", "Custom Development", "Training & Onboarding"],
  },
];

const getCompareFeatures = (vol: number) => [
  { name: "Stores", icon: Store, free: "1", pro: "3", business: "10" },
  { name: "Customers", icon: Users, free: "50", pro: formatVolume(vol), business: formatVolume(vol * 2) },
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
  const { plan } = useSubscription();
  const usage = useUsageLimits(plan);
  const currentPlan = plan.charAt(0).toUpperCase() + plan.slice(1);

  const [currency, setCurrency] = useState<"USD" | "BDT" | "INR">("BDT");
  const [yearly, setYearly] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<PlatformCoupon | null>(null);
  const [activeBanner, setActiveBanner] = useState<PlatformCoupon | null>(null);
  const [volume, setVolume] = useState([1000]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; planKey: string; planName: string; amount: number }>({ open: false, planKey: "", planName: "", amount: 0 });

  const handleUpgrade = (planDef: PlanDef) => {
    const dynamicUSD = getDynamicUSD(planDef);
    if (dynamicUSD === null || dynamicUSD === 0) return;
    let price = dynamicUSD * RATES[currency];
    if (yearly) price = price * 0.8;
    if (discountPct > 0) price = price * (1 - discountPct / 100);
    if (discountFixed > 0) price = Math.max(0, price - discountFixed);
    setPaymentModal({ open: true, planKey: planDef.key, planName: planDef.name, amount: Math.round(price * 100) / 100 });
  };

  // Fetch active coupons for banner
  useEffect(() => {
    supabase
      .from("platform_coupons")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const coupon = data as unknown as PlatformCoupon;
          // Check expiry
          if (!coupon.expires_at || new Date(coupon.expires_at) >= new Date()) {
            setActiveBanner(coupon);
          }
        }
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

  /** Calculate dynamic USD price based on volume */
  const getDynamicUSD = (p: PlanDef): number | null => {
    if (p.baseUSD === null) return null;
    if (p.baseUSD === 0) return 0;
    const extraVolume = Math.max(0, volume[0] - p.baseVolume);
    const extraCost = (extraVolume / 1000) * p.ratePerUnit;
    return p.baseUSD + extraCost;
  };

  const formatPrice = (usd: number | null) => {
    if (usd === null) return "Custom";
    if (usd === 0) return "Free";
    let price = usd * RATES[currency];
    if (yearly) price = price * 0.8;
    if (discountPct > 0) price = price * (1 - discountPct / 100);
    if (discountFixed > 0) price = Math.max(0, price - discountFixed);
    return `${CURRENCY_SYMBOLS[currency]}${price.toFixed(currency === "USD" ? 2 : 1)}`;
  };

  const originalPrice = (usd: number | null) => {
    if (usd === null || usd === 0) return null;
    const price = usd * RATES[currency];
    return `${CURRENCY_SYMBOLS[currency]}${price.toFixed(currency === "USD" ? 2 : 1)}`;
  };

  const hasDiscount = (usd: number | null) => {
    if (usd === null || usd === 0) return false;
    return yearly || discountPct > 0 || discountFixed > 0;
  };

  const applyCoupon = async () => {
    const code = couponCode.toUpperCase().trim();
    if (!code) return;

    const { data } = await supabase
      .from("platform_coupons")
      .select("*")
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();

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

  const volumeLabel = useMemo(() => {
    const v = volume[0];
    if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
    return v.toString();
  }, [volume]);

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Packages & Subscription</h1>
        </div>

        {/* Active Coupon Banner */}
        {activeBanner && !appliedCoupon && (
          <div className="flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/50 rounded-xl px-4 py-3">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              🎉 Use code <code className="bg-amber-200/50 dark:bg-amber-800/50 px-2 py-0.5 rounded font-mono font-bold">{activeBanner.code}</code> and get {activeBanner.discount_type === "percentage" ? `${activeBanner.discount_value}%` : `${CURRENCY_SYMBOLS[currency]}${activeBanner.discount_value}`} discount!
            </p>
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 text-xs" onClick={() => { setCouponCode(activeBanner.code); }}>
              Apply
            </Button>
          </div>
        )}

        {/* Special Offer Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-gray-900 to-gray-800 text-white p-6">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_50%,rgba(59,130,246,0.15),transparent)] pointer-events-none" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Badge className="bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1">
                <Sparkles className="h-3 w-3 mr-1" /> Special Offer
              </Badge>
              {appliedCoupon && (
                <div className="flex items-center gap-2">
                  <code className="bg-white/10 px-3 py-1 rounded-lg text-sm font-mono">{appliedCoupon.code}</code>
                  <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
                    <Check className="h-3 w-3 mr-1" /> Claimed
                  </Badge>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-white/60">
              <span>Expires in</span>
              <div className="flex gap-1.5">
                {[
                  { val: timeLeft.days, label: "Days" },
                  { val: timeLeft.hours, label: "Hours" },
                  { val: timeLeft.mins, label: "Mins" },
                  { val: timeLeft.secs, label: "Secs" },
                ].map((t) => (
                  <div key={t.label} className="bg-white/10 rounded-lg px-2.5 py-1.5 text-center min-w-[40px]">
                    <span className="text-white font-bold text-lg block leading-none">{String(t.val).padStart(2, "0")}</span>
                    <span className="text-[9px] text-white/50 uppercase">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Coupon Applied Message */}
        {appliedCoupon && (
          <div className="flex items-center justify-between bg-success/10 text-success border border-success/20 rounded-xl px-4 py-3 text-sm font-medium">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              Coupon <code className="bg-success/10 px-2 py-0.5 rounded font-mono text-xs">{appliedCoupon.code}</code> applied! {appliedCoupon.discount_type === "percentage" ? `${appliedCoupon.discount_value}% OFF` : `${CURRENCY_SYMBOLS[currency]}${appliedCoupon.discount_value} OFF`} on your next purchase.
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => { setAppliedCoupon(null); setCouponCode(""); toast.info("Coupon removed"); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Coupon Input */}
        <div className="flex gap-3">
          <Input
            placeholder="DISCOUNT COUPON CODE"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
            className="flex-1 uppercase font-mono tracking-widest"
          />
          <Button onClick={applyCoupon} className="px-6">Apply</Button>
        </div>

        {/* Current Plan Status */}
        <Card className="border-border/50">
          <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                <Check className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-semibold text-base">{currentPlan} Plan Active</p>
                <p className="text-sm text-muted-foreground">Lifetime access</p>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">STORES</span>
                <span className="ml-2 font-semibold text-primary">
                  {plan === "free" ? "1" : plan === "pro" ? "3" : "10"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">CUSTOMERS</span>
                <span className="ml-2 font-semibold text-primary">
                  {plan === "free" ? "50" : plan === "pro" ? formatVolume(volume[0]) : formatVolume(volume[0] * 2)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">PRODUCTS</span>
                <span className="ml-2 font-semibold text-primary">
                  {plan === "free" ? "25" : plan === "pro" ? "100" : "500"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Global Usage Summary */}
        {!usage.loading && (
          <Card className="border-border/50">
            <CardContent className="py-5 space-y-4">
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
                  const pct = item.max > 0 ? Math.min((item.current / item.max) * 100, 100) : 0;
                  const isHigh = pct >= 80;
                  return (
                    <div key={item.label} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <item.icon className="h-3.5 w-3.5" />
                          {item.label}
                        </span>
                        <span className={`font-semibold ${isHigh ? "text-destructive" : "text-foreground"}`}>
                          {item.current} / {item.max}
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

        <div className="flex justify-center gap-2">
          {(["BDT", "USD", "INR"] as const).map((c) => (
            <Button
              key={c}
              variant={currency === c ? "default" : "outline"}
              size="sm"
              onClick={() => setCurrency(c)}
              className="rounded-full px-5"
            >
              {c} ({CURRENCY_SYMBOLS[c]})
            </Button>
          ))}
          <span className="text-xs text-muted-foreground self-center ml-2">
            (1 USD = {RATES.BDT} BDT = {RATES.INR} INR)
          </span>
        </div>

        {/* Volume Slider */}
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <h3 className="text-center font-semibold text-lg">Select Customers & Orders Volume</h3>
            <p className="text-center text-sm text-muted-foreground mb-6">Price adjusts automatically based on volume</p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Customers & Orders / mo</span>
              <span className="text-xl font-bold text-primary">{volumeLabel}</span>
            </div>
            <Slider
              value={volume}
              onValueChange={setVolume}
              min={500}
              max={100000}
              step={500}
              className="my-4"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              {["500", "1K", "5K", "10K", "20K", "50K", "100K"].map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Monthly / Yearly Toggle */}
        <div className="flex justify-center items-center gap-3">
          <Button
            variant={!yearly ? "default" : "outline"}
            size="sm"
            onClick={() => setYearly(false)}
            className="rounded-full px-6"
          >
            Monthly
          </Button>
          <Button
            variant={yearly ? "default" : "outline"}
            size="sm"
            onClick={() => setYearly(true)}
            className="rounded-full px-6"
          >
            Yearly
          </Button>
          {yearly && (
            <Badge variant="outline" className="text-success border-success/30 text-xs">
              Save 20% on Yearly
            </Badge>
          )}
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((p) => {
            const isActive = p.name === currentPlan;
            const Icon = p.icon;
            return (
              <Card
                key={p.name}
                className={`relative overflow-hidden border-border/50 transition-all hover:shadow-lg ${
                  p.popular ? "ring-2 ring-primary" : ""
                }`}
              >
                {isActive && (
                  <Badge className="absolute top-3 right-3 bg-success text-success-foreground text-[10px]">
                    ACTIVE
                  </Badge>
                )}
                {p.popular && !isActive && (
                  <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground text-[10px]">
                    POPULAR
                  </Badge>
                )}
                <CardContent className="pt-6 pb-5">
                  <div className={`${p.color} font-bold text-sm mb-1`}>{p.name}</div>
                  <p className="text-xs text-muted-foreground mb-3">Package Details</p>

                  {/* Limits */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                    <span className="flex items-center gap-1"><Store className="h-3 w-3" /> {p.stores} stores</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {p.customers === "volume" ? formatVolume(p.key === "pro" ? volume[0] : volume[0] * 2) : p.customers}</span>
                    <span className="flex items-center gap-1"><Package className="h-3 w-3" /> {p.products}</span>
                  </div>

                  {(() => {
                    const dynamicUSD = getDynamicUSD(p);
                    if (dynamicUSD === 0) return (
                      <div className="my-4">
                        <span className={`text-3xl font-bold ${p.color}`}>Free</span>
                        <p className="text-sm text-muted-foreground">{p.tagline}</p>
                      </div>
                    );
                    if (dynamicUSD === null) return (
                      <div className="my-4">
                        <span className={`text-3xl font-bold ${p.color}`}>Custom</span>
                        <p className="text-sm text-muted-foreground">{p.tagline}</p>
                      </div>
                    );
                    return (
                      <div className="my-4">
                        {hasDiscount(dynamicUSD) && (
                          <span className="text-sm text-muted-foreground line-through mr-2">
                            {originalPrice(dynamicUSD)}
                          </span>
                        )}
                        <span className={`text-3xl font-bold ${p.color}`}>
                          {formatPrice(dynamicUSD)}
                        </span>
                        <span className="text-sm text-muted-foreground">/mo</span>
                        {(yearly || discountPct > 0 || discountFixed > 0) && (
                          <div className="flex items-center gap-1.5 mt-1">
                            {yearly && (
                              <Badge variant="outline" className="text-success border-success/30 text-[10px]">20% OFF</Badge>
                            )}
                            {discountPct > 0 && (
                              <Badge variant="outline" className="text-success border-success/30 text-[10px]">{discountPct}% OFF</Badge>
                            )}
                            {discountFixed > 0 && (
                              <Badge variant="outline" className="text-success border-success/30 text-[10px]">{CURRENCY_SYMBOLS[currency]}{discountFixed} OFF</Badge>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">Valid: {yearly ? "365" : "30"} days</p>
                      </div>
                    );
                  })()}

                  {isActive ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : getDynamicUSD(p) === null ? (
                    <Button variant="outline" className="w-full">
                      Contact Sales
                    </Button>
                  ) : (
                    <Button className={`w-full bg-gradient-to-r ${p.gradient} text-white`} onClick={() => handleUpgrade(p)}>
                      {getDynamicUSD(p) === 0 ? "Get Started" : "Upgrade Now"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Features of Current Plan */}
        <Card className="border-border/50">
          <CardContent className="pt-6">
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
          <CardContent className="pt-6">
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
                  {getCompareFeatures(volume[0]).map((f, i) => {
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
          <CardContent className="py-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
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
          <CardContent className="py-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="h-14 w-14 rounded-2xl bg-success/10 flex items-center justify-center flex-shrink-0">
              <Gift className="h-7 w-7 text-success" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">Invite Friends & Earn 20% Commission</h3>
              <p className="text-sm text-muted-foreground">Share your referral link. Earn 20% recurring commission for every friend who upgrades to a paid plan.</p>
            </div>
            <Button variant="outline" className="gap-2 flex-shrink-0" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/?ref=YOUR_CODE`); toast.success("Referral link copied!"); }}>
              <Copy className="h-4 w-4" /> Copy Link
            </Button>
          </CardContent>
        </Card>

        {/* FAQ Section */}
        <Card className="border-border/50">
          <CardContent className="pt-6">
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
          <CardContent className="py-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="h-14 w-14 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
              <Globe className="h-7 w-7 text-violet-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">Need a Custom Enterprise Plan?</h3>
              <p className="text-sm text-muted-foreground">Unlimited stores, custom integrations, SLA, and dedicated support for large-scale operations.</p>
            </div>
            <Button variant="outline" className="gap-2 flex-shrink-0 border-violet-300 text-violet-700 dark:text-violet-400">
              <Headphones className="h-4 w-4" /> Contact Sales
            </Button>
          </CardContent>
        </Card>

        {/* WhatsApp Support */}
        <Card className="border-border/50">
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-semibold">Questions about payment?</p>
                <p className="text-sm text-muted-foreground">Contact us on WhatsApp</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-4 w-4 rotate-[135deg]" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Payment History */}
      <PaymentHistory />

      <PaymentModal
        open={paymentModal.open}
        onOpenChange={(open) => setPaymentModal(prev => ({ ...prev, open }))}
        planKey={paymentModal.planKey}
        planName={paymentModal.planName}
        amount={paymentModal.amount}
        currency={currency}
        currencySymbol={CURRENCY_SYMBOLS[currency]}
      />
    </DashboardLayout>
  );
};

export default MyPlan;
