import { useNavigate } from "react-router-dom";
import { useLandingContent } from "@/hooks/useLandingContent";
import {
  ShoppingCart, Package, Users, Store, BarChart3, Zap, ArrowRight,
  CheckCircle2, Globe, MessageSquare, Gift, Shield,
  TrendingUp, Layers, Star, Play, Smartphone, Clock, Lock,
  ChevronDown, Headphones, CreditCard, Wifi, RefreshCw,
  Award, Target, PieChart, Sparkles, Check, X, HelpCircle,
  Mail, Phone, MapPin, ArrowUpRight, Minus, Plus,
  Download, Apple, MonitorSmartphone, Heart, ThumbsUp, Quote,
  Rocket, BarChart, Palette, Settings, AlertTriangle, Lightbulb,
  XCircle, ArrowDown, ChevronRight, Eye, Workflow, Database,
  Timer, Repeat, FileText, Bot, Crown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useState, useRef, useEffect, useMemo } from "react";
import { motion, useInView, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import VideoModal from "@/components/VideoModal";
import LandingChatbot from "@/components/LandingChatbot";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { supabase } from "@/integrations/supabase/client";
import {
  VOLUME_STEPS, formatVolume,
  PLAN_FEATURES_LIST, type VolumeStep,
} from "@/lib/planConfig";
import { usePlansConfig } from "@/contexts/PlansConfigContext";

/* ─── static imports for assets ─── */
import dashboardPreview from "@/assets/dashboard-preview.jpg";
import screenshotOrders from "@/assets/screenshot-orders.jpg";
import screenshotAnalytics from "@/assets/screenshot-analytics.jpg";
import screenshotPos from "@/assets/screenshot-pos.jpg";
import mobileAppMockup from "@/assets/mobile-app-mockup.png";
import brandLogo from "@/assets/evixPos.png";

/* ─── icon arrays for dynamic sections ─── */
const FEATURE_ICONS = [ShoppingCart, Repeat, Users, BarChart3, Bot, Globe, CreditCard, Layers, Target, Sparkles];
const PAIN_ICONS = [AlertTriangle, XCircle, Clock, Database];
const SOLUTION_ICONS = [Lightbulb, CheckCircle2, Zap, Workflow];
const WHY_ICONS = [Rocket, Shield, BarChart, Headphones];
const SHOWCASE_ICONS = [ShoppingCart, Repeat, BarChart3, Users, Bot, CreditCard];
const HOW_ICONS = [FileText, Package, Bot, TrendingUp];

/* ─── anim wrappers ─── */
const AnimSection = ({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 36 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
};
const AnimItem = ({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-30px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}} transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
};

/* ─── types & currency ─── */
type Currency = "BDT" | "INR" | "USD";
const CURRENCIES: { key: Currency; symbol: string; label: string }[] = [
  { key: "BDT", symbol: "৳", label: "BDT" },
  { key: "INR", symbol: "₹", label: "INR" },
  { key: "USD", symbol: "$", label: "USD" },
];
const RATES_FROM_INR: Record<Currency, number> = { INR: 1, USD: 0.012, BDT: 1.3 };
const CUR_SYMBOLS: Record<Currency, string> = { USD: "$", BDT: "৳", INR: "₹" };
const DEFAULT_NAV_LINKS = [
  { href: "#about", labelKey: "nav_about", defaultLabel: "About" },
  { href: "#features", labelKey: "nav_features", defaultLabel: "Features" },
  { href: "#pricing", labelKey: "nav_pricing", defaultLabel: "Pricing" },
  { href: "#testimonials", labelKey: "nav_reviews", defaultLabel: "Reviews" },
  { href: "#faq", labelKey: "nav_faq", defaultLabel: "FAQ" },
];

/* ─── Marquee component ─── */
const Marquee = ({ items, reverse = false }: { items: string[]; reverse?: boolean }) => (
  <div className="overflow-hidden relative">
    <motion.div
      className="flex gap-4 whitespace-nowrap"
      animate={{ x: reverse ? ["0%", "-50%"] : ["-50%", "0%"] }}
      transition={{ repeat: Infinity, duration: 30, ease: "linear" }}
    >
      {[...items, ...items].map((item, i) => (
        <span key={i} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-card border border-border/50 text-sm font-medium text-muted-foreground shrink-0">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          {item}
        </span>
      ))}
    </motion.div>
  </div>
);

/* ─── Feature Showcase (Desktop Interactive) ─── */
const FeatureShowcase = ({ featureCards, get }: { featureCards: number[]; get: (key: string, fallback?: string) => string }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);

  const activeI = featureCards[activeIdx] || 1;
  const title = get(`feature_${activeI}_title`) || `Feature ${activeI}`;
  const desc = get(`feature_${activeI}_desc`);
  const img = get(`feature_${activeI}_image`);
  const Icon = FEATURE_ICONS[(activeI - 1) % FEATURE_ICONS.length];
  const bullets = get(`feature_${activeI}_bullets`, "").split("|").filter(Boolean);

  return (
    <div ref={sectionRef} className="grid grid-cols-[260px_1fr] gap-6 items-start">
      {/* Left — Feature Nav */}
      <div className="sticky top-24 space-y-1 max-h-[calc(100vh-120px)] overflow-y-auto scrollbar-thin pr-1">
        {featureCards.map((i, idx) => {
          const fIcon = FEATURE_ICONS[(i - 1) % FEATURE_ICONS.length];
          const FIcon = fIcon;
          const isActive = idx === activeIdx;
          return (
            <button
              key={i}
              onClick={() => setActiveIdx(idx)}
              className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-all duration-300 group relative overflow-hidden ${
                isActive
                  ? "bg-primary/10 border border-primary/20 shadow-sm"
                  : "hover:bg-muted/60 border border-transparent"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="feature-active-bg"
                  className="absolute inset-0 bg-primary/10 rounded-xl border border-primary/20"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <div className={`relative z-10 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 ${
                isActive ? "bg-primary text-primary-foreground shadow-md shadow-primary/30" : "bg-muted/80 text-muted-foreground group-hover:bg-muted"
              }`}>
                <FIcon className="h-3.5 w-3.5" />
              </div>
              <div className="relative z-10 flex-1 min-w-0">
                <div className={`text-[13px] font-semibold truncate transition-colors duration-200 ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
                  {get(`feature_${i}_title`) || `Feature ${i}`}
                </div>
                <div className={`text-[11px] truncate transition-colors duration-200 ${isActive ? "text-primary" : "text-muted-foreground/60"}`}>
                  {get(`feature_${i}_badge`, `Feature`)}
                </div>
              </div>
              <span className={`relative z-10 text-[10px] font-bold tabular-nums transition-colors ${isActive ? "text-primary" : "text-muted-foreground/30"}`}>
                {String(idx + 1).padStart(2, '0')}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right — Feature Content */}
      <div className="relative min-h-[460px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIdx}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-xl shadow-primary/5"
          >
            {/* Image Area */}
            {img && (
              <div className="relative bg-gradient-to-b from-muted/40 to-muted/10 p-6 pb-0">
                <div className="rounded-t-xl overflow-hidden border border-border/40 border-b-0 shadow-lg bg-card">
                  <div className="flex items-center gap-1.5 px-4 py-2.5 bg-muted/60 border-b border-border/30">
                    <div className="w-3 h-3 rounded-full bg-destructive/50" />
                    <div className="w-3 h-3 rounded-full bg-warning/50" />
                    <div className="w-3 h-3 rounded-full bg-primary/40" />
                    <div className="flex-1 mx-4">
                      <div className="bg-background/60 rounded-md px-3 py-1 text-[11px] text-muted-foreground text-center font-mono max-w-[200px] mx-auto">
                        app.evixpos.com
                      </div>
                    </div>
                  </div>
                  <img src={img} alt={title} className="w-full" loading="lazy" />
                </div>
              </div>
            )}

            {/* Text Content */}
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight leading-tight">{title}</h3>
                  <span className="text-xs font-medium text-primary">{get(`feature_${activeI}_badge`, `Feature`)}</span>
                </div>
              </div>
              <p className="text-muted-foreground text-[15px] leading-relaxed max-w-xl">{desc}</p>
              {bullets.length > 0 && (
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {bullets.map((b, j) => (
                    <motion.div
                      key={j}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + j * 0.06 }}
                      className="flex items-center gap-2.5 text-sm bg-muted/30 rounded-lg px-3 py-2 border border-border/30"
                    >
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 ring-1 ring-primary/20">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-foreground/80">{b.trim()}</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Step indicator */}
        <div className="flex justify-center gap-1.5 mt-6">
          {featureCards.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIdx(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === activeIdx ? "w-8 bg-primary" : "w-3 bg-border hover:bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};


const LandingPage = () => {
  const navigate = useNavigate();
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();
  const { get, loading } = useLandingContent();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [currency, setCurrency] = useState<Currency>("BDT");
  const [activeScreenshot, setActiveScreenshot] = useState(0);
  const [policyModal, setPolicyModal] = useState<"privacy" | "terms" | "refund" | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [volumeIndex, setVolumeIndex] = useState([2]); // default 5K
  const [yearly, setYearly] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);
  const selectedVolume = VOLUME_STEPS[volumeIndex[0]] as VolumeStep;
  const { getPriceINR: dynamicGetPriceINR, getPlanLimits: dynamicGetPlanLimits } = usePlansConfig();

  const renderPolicyContent = (text: string) => {
    if (!text) return <p>Content coming soon.</p>;
    return text.split("\n").map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <br key={i} />;
      if (trimmed.startsWith("**") && trimmed.endsWith("**")) return <h3 key={i} className="font-bold text-foreground mt-4 mb-2 text-base">{trimmed.slice(2, -2)}</h3>;
      if (trimmed.startsWith("- ")) return <li key={i} className="ml-4 list-disc">{trimmed.slice(2)}</li>;
      return <p key={i} className="mb-1">{trimmed}</p>;
    });
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Check if user is logged in (for upgrade flow)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setLoggedInUser(data.session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setLoggedInUser(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  /** Get formatted price from planConfig for any plan + current currency */
  const getLandingPrice = (planKey: string): string => {
    if (planKey === "free") return "0";
    if (planKey === "custom") return "Custom";
    const inr = dynamicGetPriceINR(planKey, selectedVolume);
    let price = inr * RATES_FROM_INR[currency];
    if (yearly) price = price * 12 * 0.8;
    return price.toFixed(currency === "USD" ? 2 : 0);
  };

  const getOriginalPrice = (planKey: string): string | null => {
    if (planKey === "free" || planKey === "custom" || !yearly) return null;
    const inr = dynamicGetPriceINR(planKey, selectedVolume);
    const price = inr * RATES_FROM_INR[currency] * 12;
    return price.toFixed(currency === "USD" ? 2 : 0);
  };

  const handlePricingCTA = (planKey: string) => {
    if (planKey === "free") {
      navigate("/auth");
      return;
    }
    if (planKey === "custom") {
      window.open("mailto:support@evixpos.com?subject=Custom Plan Inquiry", "_blank");
      return;
    }
    if (loggedInUser) {
      navigate("/my-plan");
    } else {
      navigate("/auth", { state: { redirectTo: "/my-plan" } });
    }
  };

  // Auto-rotate screenshots
  const screenshots = useMemo(() => [
    { src: get("screenshot_1") || screenshotOrders, label: get("screenshot_1_label", "Order Management") },
    { src: get("screenshot_2") || screenshotAnalytics, label: get("screenshot_2_label", "Analytics & Reports") },
    { src: get("screenshot_3") || screenshotPos, label: get("screenshot_3_label", "POS System") },
    { src: get("screenshot_4") || dashboardPreview, label: get("screenshot_4_label", "Dashboard") },
  ], [get]);

  useEffect(() => {
    const timer = setInterval(() => setActiveScreenshot(p => (p + 1) % screenshots.length), 4000);
    return () => clearInterval(timer);
  }, [screenshots.length]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse"><Zap className="h-6 w-6 text-primary" /></div>
          <div className="h-1.5 w-32 bg-muted rounded-full overflow-hidden"><div className="h-full w-1/2 bg-primary rounded-full animate-[shimmer_1s_ease-in-out_infinite]" /></div>
        </div>
      </div>
    );
  }

  const bannerActive = get("banner_active", "true") === "true";

  /* Section visibility from admin */
  const show = (section: string) => get(`section_${section}_visible`, "true") !== "false";

  const smoothScroll = (id: string) => {
    setMobileMenuOpen(false);
    document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ═══════════════════ FIXED HEADER (BANNER + NAVBAR) ═══════════════════ */}
      <div className="fixed top-0 left-0 right-0 z-50 transition-all duration-300" style={{ backdropFilter: scrolled ? 'blur(20px)' : 'blur(0px)', background: scrolled ? 'hsl(var(--background) / 0.85)' : 'transparent' }}>
        {/* ANNOUNCEMENT BANNER — collapses on scroll */}
        {bannerActive && (
          <div className={`bg-gradient-to-r from-primary via-primary/90 to-primary/80 text-primary-foreground text-center text-xs sm:text-sm font-medium relative overflow-hidden transition-all duration-300 ${scrolled ? 'max-h-0 py-0 opacity-0' : 'max-h-12 py-2 sm:py-2.5 opacity-100'}`}>
            <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,hsl(0_0%_100%/0.1),transparent)] animate-[shimmer_3s_ease-in-out_infinite]" />
            <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-2 sm:gap-3 relative">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span className="line-clamp-1">{get("banner_subtitle", "Now with Offline POS + Online Store in one panel — Get 50% off your first 3 months!")}</span>
              <Button size="sm" variant="secondary" className="h-6 sm:h-7 text-[10px] sm:text-xs px-2 sm:px-3 shrink-0" onClick={() => navigate("/auth")}>{get("banner_cta", "Claim Offer")}</Button>
            </div>
          </div>
        )}

        {/* STICKY NAVBAR */}
        <div className="w-full px-3 sm:px-6 lg:px-10 pt-2 sm:pt-3 pb-1">
        <motion.nav 
          initial={{ y: -20, opacity: 0 }} 
          animate={{ y: 0, opacity: 1 }} 
          transition={{ duration: 0.5 }}
          className={`max-w-5xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-7 transition-all duration-500 ease-out ${
            scrolled
              ? "h-12 sm:h-14 rounded-2xl bg-card/90 backdrop-blur-2xl border border-border/60 shadow-[0_8px_32px_-4px_hsl(var(--foreground)/0.15)]"
              : "h-14 sm:h-16 rounded-[22px] bg-card/60 backdrop-blur-xl border border-border/30 shadow-[0_12px_40px_-6px_hsl(var(--foreground)/0.1)]"
          }`}
        >
          <div className="flex items-center gap-2 shrink-0">
            <img src={get("brand_logo") || brandLogo} alt={get("brand_name", "EvixPOS")} className={`w-auto transition-all duration-300 ${scrolled ? "h-6 sm:h-7" : "h-7 sm:h-8"}`} />
          </div>
          <div className="hidden md:flex items-center gap-0.5 absolute left-1/2 -translate-x-1/2">
            {DEFAULT_NAV_LINKS.map((link) => (
              <button key={link.href} onClick={() => smoothScroll(link.href)} className="relative px-4 py-2 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground transition-all duration-200 group">
                <span className="relative z-10">{get(link.labelKey, link.defaultLabel)}</span>
                <span className="absolute inset-0 rounded-xl bg-accent/0 group-hover:bg-accent/60 transition-colors duration-200" />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/auth")} 
              className="hidden sm:flex text-[13px] font-medium text-muted-foreground hover:text-foreground h-9 px-4 rounded-xl hover:bg-accent/60 transition-all duration-200"
            >
              {get("nav_login", "Log In")}
            </Button>
            <Button 
              size="sm" 
              onClick={() => navigate("/auth")} 
              className="gap-1.5 text-[13px] font-semibold h-9 sm:h-10 px-4 sm:px-5 rounded-full bg-primary hover:bg-primary/90 shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.4)] hover:shadow-[0_6px_20px_-4px_hsl(var(--primary)/0.5)] hover:scale-[1.03] active:scale-[0.98] transition-all duration-200"
            >
              {get("nav_start_free", "Start Free")} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
              className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center hover:bg-accent/60 active:scale-95 transition-all duration-200"
            >
              <div className="flex flex-col gap-1.5">
                <span className={`w-5 h-0.5 bg-foreground rounded-full transition-all duration-300 ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`} />
                <span className={`w-5 h-0.5 bg-foreground rounded-full transition-all duration-300 ${mobileMenuOpen ? "opacity-0" : ""}`} />
                <span className={`w-5 h-0.5 bg-foreground rounded-full transition-all duration-300 ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
              </div>
            </button>
          </div>
        </motion.nav>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, y: -10, scale: 0.98 }} 
              animate={{ opacity: 1, y: 0, scale: 1 }} 
              exit={{ opacity: 0, y: -10 }} 
              className="md:hidden max-w-5xl mx-auto mt-2.5 rounded-2xl border border-border/30 bg-background/90 backdrop-blur-2xl shadow-xl overflow-hidden"
            >
              <div className="px-3 py-3 space-y-0.5">
                {DEFAULT_NAV_LINKS.map((link, i) => (
                  <motion.button 
                    key={link.href} 
                    initial={{ opacity: 0, x: -12 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    transition={{ delay: i * 0.05 }} 
                    onClick={() => smoothScroll(link.href)} 
                    className="block w-full text-left px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200"
                  >
                    {get(link.labelKey, link.defaultLabel)}
                  </motion.button>
                ))}
                <div className="pt-2 px-2 pb-1 flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => { setMobileMenuOpen(false); navigate("/auth"); }} 
                    className="flex-1 rounded-xl h-10 text-sm font-medium hover:bg-accent/50 transition-all"
                  >
                    {get("nav_login", "Log In")}
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => { setMobileMenuOpen(false); navigate("/auth"); }} 
                    className="flex-1 rounded-xl h-10 text-sm gap-1.5 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    {get("nav_start_free", "Start Free")} <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>

      {/* ═══════════════════ HERO — 5-Second Clarity ═══════════════════ */}
      <section className="relative pt-32 sm:pt-36 lg:pt-40 pb-10 sm:pb-14 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-10%,hsl(var(--primary)/0.08),transparent_70%)]" />
        <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-card/50 to-transparent" />
        <div className="absolute top-32 -left-32 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-primary/4 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border)/0.12)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.12)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black,transparent)]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          {/* Social proof badge */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm">
              <div className="flex -space-x-2">
                {[1,2,3].map(i => {
                  const img = get(`social_proof_avatar_${i}`);
                  return img ? (
                    <img key={i} src={img} className="w-7 h-7 rounded-full border-2 border-card object-cover" alt="" />
                  ) : (
                    <div key={i} className="w-7 h-7 rounded-full border-2 border-card bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center">
                      <Users className="h-3 w-3 text-primary-foreground" />
                    </div>
                  );
                })}
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {get("hero_social_proof", "Trusted by 3,000+ businesses worldwide")}
              </span>
              <Button variant="ghost" size="sm" onClick={() => navigate("/auth")} className="h-7 px-3 text-xs font-semibold text-primary hover:text-primary">
                Join Now <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </motion.div>

          {/* Hero headline — centered for max impact */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="text-center max-w-4xl mx-auto mb-6">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-black tracking-tight leading-[1.08] mb-6">
              <motion.span
                initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="inline-block"
              >
                {get("hero_title_line1", "One Platform.")}
              </motion.span>
              <br />
              <motion.span
                initial={{ opacity: 0, y: 20, filter: "blur(8px)", scale: 0.95 }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }}
                transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="inline-block bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent bg-[length:200%_auto] animate-[shimmer-gradient_3s_ease-in-out_infinite]"
              >
                {get("hero_title_line2", "Online + Offline.")}
              </motion.span>
            </h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-8"
            >
              {get("hero_subtitle", "Manage your online store, POS billing, walk-in sales, inventory, customers & profit analytics — all from one powerful panel. No more juggling separate tools.")}
            </motion.p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-8 w-full max-w-xl mx-auto">
              <Button 
                size="lg" 
                onClick={() => navigate("/auth")} 
                className="w-full sm:w-auto text-base px-6 sm:px-8 gap-2 h-12 sm:h-13 font-semibold rounded-xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
              >
                {get("hero_cta_primary", "Get Started Free")} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              {get("hero_video_url") ? (
                <Button 
                  size="lg" 
                  variant="outline" 
                  onClick={() => setVideoOpen(true)} 
                  className="w-full sm:w-auto text-base px-6 sm:px-8 gap-2 h-12 sm:h-13 font-semibold rounded-xl border-2 border-border hover:border-primary/50 hover:bg-accent/50 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
                >
                  <Play className="h-4 w-4" /> {get("hero_cta_secondary", "See How It Works")}
                </Button>
              ) : (
                <Button 
                  size="lg" 
                  variant="outline" 
                  onClick={() => smoothScroll("#how-it-works")} 
                  className="w-full sm:w-auto text-base px-6 sm:px-8 gap-2 h-12 sm:h-13 font-semibold rounded-xl border-2 border-border hover:border-primary/50 hover:bg-accent/50 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
                >
                  <Play className="h-4 w-4" /> {get("hero_cta_secondary", "See How It Works")}
                </Button>
              )}
            </div>
            <div className="flex items-center justify-center gap-5 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> {get("hero_bullet_1", "Online + Offline in one panel")}</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> {get("hero_bullet_2", "No credit card needed")}</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> {get("hero_bullet_3", "Setup in 2 minutes")}</span>
            </div>
          </motion.div>

          {/* Dashboard Preview */}
          <motion.div initial={{ opacity: 0, y: 60, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} className="relative max-w-5xl mx-auto mt-12">
            <div className="absolute -inset-6 bg-gradient-to-tr from-primary/15 via-primary/5 to-transparent rounded-3xl blur-3xl" />
            <div className="relative rounded-2xl overflow-hidden border border-border/50 shadow-2xl shadow-primary/10">
              <div className="bg-muted/80 h-9 flex items-center gap-2 px-4 border-b border-border/50">
                <div className="w-3 h-3 rounded-full bg-destructive/60" />
                <div className="w-3 h-3 rounded-full bg-warning/60" />
                <div className="w-3 h-3 rounded-full bg-primary/60" />
                <div className="flex-1 flex justify-center"><div className="bg-background/60 rounded-md px-8 py-0.5 text-[10px] text-muted-foreground">app.evixpos.com</div></div>
              </div>
              <img src={get("hero_image") || dashboardPreview} alt="EvixPOS Dashboard" className="w-full" width={1280} height={800} />
            </div>
            {/* Floating stat cards */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="absolute -bottom-5 -left-4 sm:-bottom-6 sm:-left-8 bg-card rounded-xl border border-border/50 p-4 shadow-xl backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-primary" /></div>
                <div><div className="text-xs text-muted-foreground">Revenue Today</div><div className="text-lg font-bold">৳42,580</div></div>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="absolute -top-3 -right-3 sm:-top-5 sm:-right-6 bg-card rounded-xl border border-border/50 p-3 shadow-xl backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><Package className="h-4 w-4 text-primary" /></div>
                <div><div className="text-[10px] text-muted-foreground">New Orders</div><div className="text-sm font-bold text-primary">+24</div></div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ TRUST STATS ═══════════════════ */}
      {show("trust") && <section className="py-8 sm:py-10 border-y border-border/40 bg-muted/20 relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.04),transparent_70%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
            {[
              { val: get("stats_users", "3,000+"), label: get("stats_users_label", "Active Businesses"), icon: Users },
              { val: get("stats_stores", "1,983+"), label: get("stats_stores_label", "Online & Offline Stores"), icon: Store },
              { val: get("stats_orders", "50K+"), label: get("stats_orders_label", "Orders Processed"), icon: Package },
              { val: get("stats_uptime", "99.9%"), label: get("stats_uptime_label", "Uptime"), icon: Shield },
            ].map((s, idx) => (
              <AnimItem key={s.label} delay={idx * 0.1} className="text-center group">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="text-3xl sm:text-4xl font-black text-foreground mb-1">{s.val}</div>
                <div className="text-sm text-muted-foreground font-medium">{s.label}</div>
              </AnimItem>
            ))}
          </div>
        </div>
      </section>}

      {show("pain_points") && <section id="pain-points" className="py-12 sm:py-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,hsl(var(--muted)/0.5),transparent)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <AnimSection className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4 text-destructive border-destructive/30 px-3 py-1.5">
              <AlertTriangle className="h-3 w-3 mr-1.5" /> {get("pain_badge", "The Problem")}
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-5">
              {get("pain_title", "Running Online + Offline Shouldn't Feel Like Two Jobs")}
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              {get("pain_subtitle", "You sell online and from a physical counter — but you're using separate tools for each. Disconnected data, missed sales, and zero visibility into real profits.")}
            </p>
          </AnimSection>

          <div className="grid lg:grid-cols-2 gap-6 lg:gap-10">
            {/* OLD WAY */}
            <AnimItem>
              <div className="relative rounded-2xl border-2 border-destructive/20 bg-gradient-to-b from-destructive/5 to-card overflow-hidden h-full">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-destructive/10 bg-destructive/5">
                  <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center"><Clock className="h-4 w-4 text-destructive" /></div>
                  <span className="font-bold text-destructive text-sm">🕐 {get("pain_old_title", "Without EvixPOS")}</span>
                </div>
                {get("pain_old_image") && (
                  <div className="px-6 pt-4"><img src={get("pain_old_image")} alt="Old way" className="w-full rounded-xl border border-destructive/10" loading="lazy" /></div>
                )}
                <div className="p-6 grid grid-cols-2 gap-4">
                  {[
                     { label: get("pain_metric_1_label", "Tools Used"), val: get("pain_metric_1_val", "5+ Apps") },
                     { label: get("pain_metric_2_label", "Data Sync"), val: get("pain_metric_2_val", "Manual") },
                     { label: get("pain_metric_3_label", "Profit Visibility"), val: get("pain_metric_3_val", "Guesswork") },
                     { label: get("pain_metric_4_label", "Time Wasted"), val: get("pain_metric_4_val", "5+ Hrs/Day") },
                  ].map((m, i) => (
                    <div key={i} className="bg-destructive/5 rounded-xl p-4 border border-destructive/10">
                      <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
                      <div className="text-lg font-black text-destructive">{m.val}</div>
                    </div>
                  ))}
                </div>
                <div className="px-6 pb-6 space-y-3">
                  {[1, 2, 3, 4].map(i => {
                    const text = get(`pain_${i}_title`);
                    if (!text) return null;
                    return (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">{text}</span>
                          {get(`pain_${i}_desc`) && <p className="text-muted-foreground text-xs mt-0.5">{get(`pain_${i}_desc`)}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </AnimItem>

            {/* NEW WAY */}
            <AnimItem delay={0.15}>
              <div className="relative rounded-2xl border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-card overflow-hidden h-full">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-primary/10 bg-primary/5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><Sparkles className="h-4 w-4 text-primary" /></div>
                  <span className="font-bold text-primary text-sm">✨ {get("pain_new_title", "With EvixPOS")}</span>
                </div>
                {get("pain_new_image") && (
                  <div className="px-6 pt-4"><img src={get("pain_new_image")} alt="New way" className="w-full rounded-xl border border-primary/10" loading="lazy" /></div>
                )}
                <div className="p-6 grid grid-cols-2 gap-4">
                  {[
                     { label: get("solution_metric_1_label", "One Panel"), val: get("solution_metric_1_val", "Online + Offline") },
                     { label: get("solution_metric_2_label", "Data Sync"), val: get("solution_metric_2_val", "Real-Time") },
                     { label: get("solution_metric_3_label", "Profit View"), val: get("solution_metric_3_val", "Instant") },
                     { label: get("solution_metric_4_label", "Time Saved"), val: get("solution_metric_4_val", "4+ Hrs/Day") },
                  ].map((m, i) => (
                    <div key={i} className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                      <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
                      <div className="text-lg font-black text-primary">{m.val}</div>
                    </div>
                  ))}
                </div>
                <div className="px-6 pb-6 space-y-3">
                  {[1, 2, 3, 4].map(i => {
                    const text = get(`solution_${i}_title`);
                    if (!text) return null;
                    return (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">{text}</span>
                          {get(`solution_${i}_desc`) && <p className="text-muted-foreground text-xs mt-0.5">{get(`solution_${i}_desc`)}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </AnimItem>
          </div>

          {/* Transition CTA */}
          <AnimSection className="text-center mt-8" delay={0.2}>
            <Button size="lg" onClick={() => navigate("/auth")} className="gap-2 rounded-xl shadow-lg shadow-primary/20 px-8">
              {get("pain_cta", "Unify Your Business Today")} <ArrowRight className="h-4 w-4" />
            </Button>
          </AnimSection>
        </div>
      </section>}

      {show("features") && (() => {
        const featureCards = Array.from({ length: 20 }, (_, i) => i + 1).filter(i => get(`feature_${i}_title`) || get(`feature_${i}_image`));
        return (
          <section id="features" className="relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.06),transparent_70%)]" />

            {/* Header */}
            <div className="pt-10 sm:pt-14 pb-6 sm:pb-8">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <AnimSection className="text-center max-w-3xl mx-auto">
                  <Badge variant="outline" className="mb-5 text-primary border-primary/30 px-4 py-1.5 text-sm font-medium backdrop-blur-sm bg-card/50">
                    <Layers className="h-3.5 w-3.5 mr-1.5" /> {get("features_badge", "Core Features")}
                  </Badge>
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight mb-4 leading-[1.15]">
                    {get("features_title", "Everything for Online & Offline Business")}
                  </h2>
                  <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
                    {get("features_subtitle", "From e-commerce orders to walk-in POS billing — one platform handles it all.")}
                  </p>
                </AnimSection>
              </div>
            </div>

            {/* Desktop — Interactive Tab + Content */}
            <div className="hidden lg:block max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 relative">
              <FeatureShowcase featureCards={featureCards} get={get} />
            </div>

            {/* Mobile — Vertical cards */}
            <div className="lg:hidden max-w-7xl mx-auto px-4 sm:px-6 pb-12 space-y-4">
              {featureCards.map((i) => {
                const title = get(`feature_${i}_title`);
                const desc = get(`feature_${i}_desc`);
                const img = get(`feature_${i}_image`);
                const Icon = FEATURE_ICONS[(i - 1) % FEATURE_ICONS.length];
                const bullets = get(`feature_${i}_bullets`, "").split("|").filter(Boolean);

                return (
                  <AnimItem key={i} delay={(i - 1) * 0.05}>
                    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm">
                      {img && (
                        <div className="bg-muted/30 p-4 pb-0">
                          <div className="rounded-t-xl overflow-hidden border border-border/40 border-b-0 bg-card">
                            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-muted/60 border-b border-border/30">
                              <div className="w-2 h-2 rounded-full bg-destructive/50" />
                              <div className="w-2 h-2 rounded-full bg-warning/50" />
                              <div className="w-2 h-2 rounded-full bg-primary/40" />
                            </div>
                            <img src={img} alt={title || ""} className="w-full" loading="lazy" />
                          </div>
                        </div>
                      )}
                      <div className="p-5 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <h3 className="text-lg font-black">{title || `Feature ${i}`}</h3>
                        </div>
                        <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
                        {bullets.length > 0 && (
                          <ul className="space-y-1.5 pt-1">
                            {bullets.map((b, j) => (
                              <li key={j} className="flex items-center gap-2.5 text-sm">
                                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="text-foreground/80">{b.trim()}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </AnimItem>
                );
              })}
            </div>
          </section>
        );
      })()}

      {show("who") && <section className="py-10 sm:py-14 bg-muted/20 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-10">
          <AnimSection className="text-center max-w-3xl mx-auto">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1.5">
              <Target className="h-3 w-3 mr-1.5" /> {get("who_badge", "Who Is It For?")}
            </Badge>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mb-5">
              {get("who_title", "Built for Every Business Model")}
            </h2>
          </AnimSection>
        </div>
        <div className="space-y-4">
          <Marquee items={(get("who_list_1", "OTT Subscription|Educational Courses|Memberships|Gym & Fitness|Hosting Services|Themes & Plugins")).split("|")} />
          <Marquee items={(get("who_list_2", "License Keys|Physical Products|Personal Services|SaaS Products|Logistic Services|Digital Products")).split("|")} reverse />
        </div>
      </section>}


      {show("how_it_works") && <section id="how-it-works" className="py-10 sm:py-14 bg-muted/20 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_80%_50%,hsl(var(--primary)/0.06),transparent)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <AnimSection className="text-center max-w-3xl mx-auto mb-10">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1.5">
              <Timer className="h-3 w-3 mr-1.5" /> {get("how_badge", "Quick Setup")}
            </Badge>
             <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mb-5">
               {get("how_it_works_title", "Go Live in Under 15 Minutes")}
             </h2>
             <p className="text-muted-foreground text-lg leading-relaxed">
               {get("how_it_works_subtitle", "Whether you're setting up an online store or a physical POS — you'll be selling in four simple steps.")}
            </p>
          </AnimSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => {
              const Icon = HOW_ICONS[(i - 1) % HOW_ICONS.length];
              return (
                <AnimItem key={i} delay={(i - 1) * 0.12}>
                  <div className="relative group h-full">
                    {i < 4 && (
                      <div className="hidden lg:block absolute top-12 left-[calc(100%+8px)] w-[calc(100%-48px)] h-[2px]">
                        <div className="h-full bg-gradient-to-r from-primary/30 via-primary/15 to-transparent rounded-full" />
                        <ArrowRight className="absolute -right-1 -top-[7px] h-4 w-4 text-primary/30" />
                      </div>
                    )}
                    <div className="bg-card rounded-2xl border border-border/50 p-6 sm:p-7 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-500 relative overflow-hidden h-full">
                      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary/60 to-primary/20 scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center mx-auto mb-4">
                        <span className="text-xl font-black text-primary">0{i}</span>
                      </div>
                      <h3 className="font-bold text-base mb-2">{get(`step_${i}_title`, `Step ${i}`)}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">{get(`step_${i}_desc`, "")}</p>
                      {get(`step_${i}_tags`) && (
                        <div className="flex flex-wrap gap-1.5 justify-center mt-4">
                          {get(`step_${i}_tags`, "").split("|").filter(Boolean).map((tag, j) => (
                            <span key={j} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">{tag.trim()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </AnimItem>
              );
            })}
          </div>
        </div>
      </section>}

      {show("about") && <section id="about" className="py-10 sm:py-14 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_20%_50%,hsl(var(--primary)/0.06),transparent)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <AnimSection>
              <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1.5">
                <Sparkles className="h-3 w-3 mr-1.5" /> {get("about_badge", "About Us")}
              </Badge>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mb-6">
               {get("about_title", "Built for the Hybrid Business Owner")}
             </h2>
             <p className="text-muted-foreground text-lg leading-relaxed mb-6">{get("about_desc_1", "EvixPOS is the all-in-one business management platform that bridges the gap between online and offline commerce. Whether you run an e-commerce store, a physical retail shop, or both — we give you one unified panel to manage everything.")}</p>
             <p className="text-muted-foreground leading-relaxed mb-8">{get("about_desc_2", "Founded with the mission to eliminate the chaos of juggling separate tools. We believe every business deserves enterprise-grade management without enterprise-grade complexity.")}</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: Globe, label: get("about_point_1", "Online + Offline") },
                  { icon: Shield, label: get("about_point_2", "Bank-Grade Security") },
                  { icon: Clock, label: get("about_point_3", "24/7 Support") },
                  { icon: Smartphone, label: get("about_point_4", "Mobile Ready") },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 text-sm font-medium">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><item.icon className="h-4 w-4 text-primary" /></div>
                    {item.label}
                  </div>
                ))}
              </div>
            </AnimSection>
            <AnimSection delay={0.2}>
              <div className="relative">
                <div className="absolute -inset-8 bg-gradient-to-tr from-primary/10 to-transparent rounded-3xl blur-2xl" />
                <div className="relative rounded-2xl overflow-hidden border border-border/50 shadow-2xl">
                  <img src={get("about_image") || dashboardPreview} alt="About EvixPOS" className="w-full" loading="lazy" />
                </div>
              </div>
            </AnimSection>
          </div>
        </div>
      </section>}

      {show("why_us") && <section id="why-us" className="py-10 sm:py-14 bg-muted/20 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <AnimSection className="text-center max-w-3xl mx-auto mb-10">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1.5">
              <Award className="h-3 w-3 mr-1.5" /> {get("why_badge", "Why EvixPOS")}
            </Badge>
             <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mb-5">
               {get("why_title", "One Dashboard. Online + Offline. Zero Compromise.")}
             </h2>
             <p className="text-muted-foreground text-lg leading-relaxed">{get("why_subtitle", "We're not just another tool — we're the only platform that truly unifies your online and offline business.")}</p>
          </AnimSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => {
              const Icon = WHY_ICONS[i - 1];
              return (
                <AnimItem key={i} delay={(i - 1) * 0.1}>
                  <div className="bg-card rounded-2xl border border-border/50 p-6 text-center hover:shadow-xl hover:-translate-y-1.5 transition-all duration-500 group h-full">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center mx-auto mb-4 group-hover:from-primary/25 group-hover:to-primary/10 transition-all">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-bold text-base mb-2">{get(`why_${i}_title`, `Reason ${i}`)}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{get(`why_${i}_desc`, "")}</p>
                  </div>
                </AnimItem>
              );
            })}
          </div>
        </div>
      </section>}

      {show("comparison") && <section className="py-10 sm:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimSection className="text-center max-w-3xl mx-auto mb-10">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1.5">
              <Target className="h-3 w-3 mr-1.5" /> {get("comparison_badge", "Comparison")}
            </Badge>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mb-5">
              {get("comparison_title", "Why EvixPOS Beats Separate Tools")}
            </h2>
          </AnimSection>
          <AnimSection delay={0.15}>
            <div className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-xl">
              <div className="grid grid-cols-3 bg-muted/50 border-b border-border/50">
                <div className="p-4 sm:p-5 text-sm font-semibold text-muted-foreground">Feature</div>
                <div className="p-4 sm:p-5 text-center"><div className="text-sm font-bold text-primary">{get("brand_name", "EvixPOS")}</div></div>
                <div className="p-4 sm:p-5 text-center text-sm font-semibold text-muted-foreground">Others</div>
              </div>
              {(get("comparison_features", "Online + Offline in One Panel|Built-in POS System|Walk-in Sales Management|Multi-Store (Online & Offline)|Subscription & Renewal Tracking|WhatsApp Integration|Multi-Currency Support|Free Plan Available")).split("|").map((feature, i, arr) => (
                <div key={feature} className={`grid grid-cols-3 ${i < arr.length - 1 ? "border-b border-border/30" : ""} hover:bg-muted/30 transition-colors`}>
                  <div className="p-4 sm:p-5 text-sm">{feature.trim()}</div>
                  <div className="p-4 sm:p-5 flex justify-center"><div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center"><Check className="h-4 w-4 text-primary" /></div></div>
                  <div className="p-4 sm:p-5 flex justify-center">{i < 3 ? <div className="w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center"><X className="h-4 w-4 text-destructive" /></div> : <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center"><Minus className="h-4 w-4 text-muted-foreground" /></div>}</div>
                </div>
              ))}
            </div>
          </AnimSection>
        </div>
      </section>}

      {show("mobile") && <section className="py-10 sm:py-14 bg-muted/20 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_50%,hsl(var(--primary)/0.08),transparent)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <AnimSection className="flex justify-center order-2 lg:order-1">
              <div className="relative">
                <div className="absolute -inset-8 bg-gradient-to-br from-primary/15 to-transparent rounded-full blur-3xl" />
                <motion.img src={get("app_download_image") || mobileAppMockup} alt="EvixPOS Mobile" className="relative w-[260px] sm:w-[300px] drop-shadow-2xl" loading="lazy" whileHover={{ y: -8, rotate: -2 }} transition={{ type: "spring", stiffness: 200 }} />
              </div>
            </AnimSection>
            <AnimSection delay={0.15} className="order-1 lg:order-2">
              <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1.5">
                <Download className="h-3 w-3 mr-1.5" /> {get("mobile_badge", "Mobile App")}
              </Badge>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mb-5">
               {get("app_download_title", "Download EvixPOS App")}
             </h2>
             <p className="text-muted-foreground text-lg leading-relaxed mb-8">{get("app_download_subtitle", "Get the full power of EvixPOS on your mobile device. Available on all platforms.")}</p>
              <ul className="space-y-3 mb-8">
                {(get("mobile_features", "Process walk-in POS sales from your phone|Track online orders in real-time|Manage inventory across all stores|View combined profit analytics")).split("|").map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm"><div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Check className="h-3.5 w-3.5 text-primary" /></div>{item.trim()}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                {get("app_download_android") ? <a href={get("app_download_android")} target="_blank" rel="noopener noreferrer"><Button size="lg" className="gap-2 h-12 px-6"><Download className="h-5 w-5" /> Google Play</Button></a> : null}
                {get("app_download_ios") ? <a href={get("app_download_ios")} target="_blank" rel="noopener noreferrer"><Button size="lg" variant="outline" className="gap-2 h-12 px-6"><Apple className="h-5 w-5" /> App Store</Button></a> : null}
                {!get("app_download_android") && !get("app_download_ios") && (
                  <>
                    <Button size="lg" className="gap-2 h-12 px-6" onClick={() => { if (canInstall) { promptInstall(); } else { navigate("/auth"); } }}>
                      <Smartphone className="h-5 w-5" /> {canInstall ? "Install App" : "Use Web App"}
                    </Button>
                    {!canInstall && !isInstalled && (
                      <Button size="lg" variant="outline" className="gap-2 h-12 px-6 text-muted-foreground" onClick={() => navigate("/auth")}>
                        <Download className="h-5 w-5" /> Open in Browser
                      </Button>
                    )}
                    {isInstalled && (
                      <Button size="lg" variant="outline" className="gap-2 h-12 px-6 text-primary border-primary/30" disabled>
                        <Check className="h-5 w-5" /> App Installed
                      </Button>
                    )}
                  </>
                )}
              </div>
            </AnimSection>
          </div>
        </div>
      </section>}

      {show("pricing") && <section id="pricing" className="py-12 sm:py-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,hsl(var(--primary)/0.08),transparent)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          {/* Header */}
          <AnimSection className="text-center max-w-3xl mx-auto mb-8">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1.5">
              <CreditCard className="h-3 w-3 mr-1.5" /> {get("pricing_badge", "Pricing")}
            </Badge>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mb-5">
              {get("pricing_title", "Plans That Scale With You")}
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">{get("pricing_subtitle", "Start free. Upgrade when you're ready. No hidden fees.")}</p>
          </AnimSection>

          {/* Currency Toggle */}
          <AnimSection delay={0.1} className="flex justify-center mb-6">
            <div className="inline-flex bg-card rounded-xl border border-border/50 p-1 shadow-sm">
              {CURRENCIES.map((c) => (
                <button key={c.key} onClick={() => setCurrency(c.key)} className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${currency === c.key ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}>{c.symbol} {c.label}</button>
              ))}
            </div>
          </AnimSection>

          {/* Volume Slider */}
          <AnimSection delay={0.15} className="max-w-lg mx-auto mb-6">
            <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-5 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Customer Volume
                </span>
                <motion.span
                  key={selectedVolume}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-xl font-black text-primary"
                >
                  {formatVolume(selectedVolume)}
                </motion.span>
              </div>
              <Slider
                value={volumeIndex}
                onValueChange={setVolumeIndex}
                min={0}
                max={VOLUME_STEPS.length - 1}
                step={1}
                className="my-3"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground/60">
                {["500", "1K", "5K", "10K", "20K", "50K", "100K"].map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            </div>
          </AnimSection>

          {/* Monthly / Yearly Toggle */}
          <AnimSection delay={0.2} className="flex justify-center items-center gap-3 mb-10">
            <div className="inline-flex bg-card rounded-xl border border-border/50 p-1 shadow-sm">
              <button onClick={() => setYearly(false)} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${!yearly ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}>Monthly</button>
              <button onClick={() => setYearly(true)} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${yearly ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}>Yearly</button>
            </div>
            {yearly && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs font-bold">
                  <Sparkles className="h-3 w-3 mr-1" /> Save 20%
                </Badge>
              </motion.div>
            )}
          </AnimSection>

          {/* Plan Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
            {[
              {
                name: "Free", key: "free", icon: Zap, tagline: "Forever free",
                gradient: "from-muted/50 to-muted/20",
                stores: "1", products: "25", customers: "50",
                features: PLAN_FEATURES_LIST.free,
              },
              {
                name: "Pro", key: "pro", icon: Crown, tagline: "Best for growing businesses",
                popular: true, gradient: "from-primary/10 to-primary/5",
                stores: "3", products: "100", customers: formatVolume(selectedVolume),
                features: PLAN_FEATURES_LIST.pro,
              },
              {
                name: "Business", key: "business", icon: Shield, tagline: "For scaling teams",
                bestValue: true, gradient: "from-orange-500/10 to-orange-500/5",
                stores: "10", products: "500", customers: formatVolume(Math.max(selectedVolume, 1000)),
                features: PLAN_FEATURES_LIST.business,
              },
              {
                name: "Custom", key: "custom", icon: Star, tagline: "For large businesses",
                gradient: "from-violet-500/10 to-violet-500/5",
                stores: "Unlimited", products: "Unlimited", customers: "Unlimited",
                features: ["Everything in Business", "Custom Integrations", "Dedicated Account Manager", "SLA Guarantee"],
              },
            ].map((plan, idx) => {
              const price = getLandingPrice(plan.key);
              const origPrice = getOriginalPrice(plan.key);
              const isPro = plan.key === "pro";
              const isBiz = plan.key === "business";
              return (
                <AnimItem key={plan.key} delay={idx * 0.1}>
                  <Card className={`relative overflow-hidden transition-all duration-500 hover:shadow-2xl group h-full ${
                    isPro ? "border-primary/60 shadow-xl shadow-primary/10 ring-1 ring-primary/20" :
                    isBiz ? "border-orange-400/40 shadow-lg" :
                    "border-border/50 hover:-translate-y-1"
                  }`}>
                    {/* Top accent */}
                    {isPro && <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-primary/80 to-primary/40" />}
                    {isBiz && <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-orange-500 via-orange-400 to-red-400" />}
                    <div className={`absolute inset-0 bg-gradient-to-b ${plan.gradient} pointer-events-none`} />

                    <CardContent className="p-6 relative flex flex-col h-full">
                      {/* Badges */}
                      {isPro && (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold mb-3 border border-primary/20 w-fit px-[12px] py-[4px] text-center">
                          <Star className="h-3 w-3 fill-current" /> POPULAR
                        </div>
                      )}
                      {isBiz && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 text-orange-600 text-xs font-bold mb-3 border border-orange-500/20 w-fit">
                          <Award className="h-3 w-3" /> BEST VALUE
                        </div>
                      )}

                      {/* Plan name & limits */}
                      <h3 className="text-lg font-bold mb-0.5">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground mb-3">{plan.tagline}</p>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-4 flex-wrap">
                        <span className="flex items-center gap-1"><Store className="h-3 w-3" /> {plan.stores} stores</span>
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {plan.customers}</span>
                        <span className="flex items-center gap-1"><Package className="h-3 w-3" /> {plan.products} products</span>
                      </div>

                      {/* Pricing */}
                      {plan.key === "free" ? (
                        <div className="mb-5">
                          <span className="text-3xl font-black text-foreground">Free</span>
                          <span className="text-sm text-muted-foreground ml-1">/forever</span>
                        </div>
                      ) : plan.key === "custom" ? (
                        <div className="mb-5">
                          <span className="text-3xl font-black text-violet-600">Custom</span>
                          <p className="text-xs text-muted-foreground mt-1">Contact for pricing</p>
                        </div>
                      ) : (
                        <div className="mb-5">
                          {origPrice && (
                            <span className="text-sm text-muted-foreground line-through mr-2">
                              {CUR_SYMBOLS[currency]}{origPrice}
                            </span>
                          )}
                          <motion.span
                            key={`${plan.key}-${selectedVolume}-${currency}-${yearly}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`text-3xl font-black ${isPro ? "text-primary" : "text-orange-600"}`}
                          >
                            {CUR_SYMBOLS[currency]}{price}
                          </motion.span>
                          <span className="text-sm text-muted-foreground">/{yearly ? "yr" : "mo"}</span>
                          {yearly && (
                            <div className="mt-1">
                              <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 text-[10px]">20% OFF</Badge>
                            </div>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-1">Valid: {yearly ? "365" : "30"} days</p>
                        </div>
                      )}

                      {/* Features */}
                      <ul className="space-y-2 mb-6 flex-1">
                        {plan.features.slice(0, 6).map((f) => (
                          <li key={f} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-muted-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>

                      {/* CTA */}
                      <Button
                        className={`w-full h-11 font-semibold ${isPro ? "shadow-lg shadow-primary/25" : ""}`}
                        variant={isPro ? "default" : plan.key === "custom" ? "outline" : "outline"}
                        size="lg"
                        onClick={() => handlePricingCTA(plan.key)}
                      >
                        {plan.key === "free" ? "Start Free" : plan.key === "custom" ? "Contact Sales" : loggedInUser ? "Upgrade Now" : "Get Started"}
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </CardContent>
                  </Card>
                </AnimItem>
              );
            })}
          </div>
        </div>
      </section>}

      {show("testimonials") && <section id="testimonials" className="py-10 sm:py-14 bg-muted/20 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <AnimSection className="text-center max-w-3xl mx-auto mb-10">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1.5">
              <Star className="h-3 w-3 mr-1.5" /> {get("testimonials_badge", "Testimonials")}
            </Badge>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mb-5">
              {get("testimonials_title", "Real Stories From Real Businesses")}
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">{get("testimonials_subtitle", "See how businesses just like yours are leveling up.")}</p>
          </AnimSection>
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => {
              const imgUrl = get(`testimonial_${i}_image`);
              return (
                <AnimItem key={i} delay={(i - 1) * 0.12}>
                  <Card className="border-border/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-500 bg-card/80 backdrop-blur-sm relative overflow-hidden group h-full">
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardContent className="p-6">
                      <Quote className="h-7 w-7 text-primary/20 mb-3" />
                      <div className="flex gap-1 mb-3">{Array.from({ length: 5 }).map((_, j) => <Star key={j} className="h-4 w-4 fill-primary text-primary" />)}</div>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-5">"{get(`testimonial_${i}_text`, "Great platform!")}"</p>
                      <div className="flex items-center gap-3">
                        {imgUrl ? <img src={imgUrl} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-primary/20" /> : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border-2 border-primary/20">
                            <span className="text-sm font-bold text-primary">{get(`testimonial_${i}_name`, "U").charAt(0)}</span>
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-sm">{get(`testimonial_${i}_name`, "User")}</div>
                          <div className="text-xs text-muted-foreground">{get(`testimonial_${i}_role`, "Business Owner")}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </AnimItem>
              );
            })}
          </div>
        </div>
      </section>}

      {show("faq") && <section id="faq" className="py-10 sm:py-14">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimSection className="text-center mb-10">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 px-3 py-1.5">
              <HelpCircle className="h-3 w-3 mr-1.5" /> FAQ
            </Badge>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mb-5">
              {get("faq_title", "Got Questions? We've Got Answers.")}
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">{get("faq_subtitle", "Everything you need to know before getting started.")}</p>
          </AnimSection>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => {
              const question = get(`faq_${i}_q`, "");
              const answer = get(`faq_${i}_a`, "");
              if (!question) return null;
              const isOpen = openFaq === i;
              return (
                <AnimItem key={i} delay={(i - 1) * 0.06}>
                  <div className="bg-card rounded-xl border border-border/50 overflow-hidden hover:shadow-md transition-shadow">
                    <button onClick={() => setOpenFaq(isOpen ? null : i)} className="w-full flex items-center justify-between p-5 text-left">
                      <span className="font-semibold text-sm sm:text-base pr-4">{question}</span>
                      <motion.div animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.2 }} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0"><Plus className="h-4 w-4" /></motion.div>
                    </button>
                    <motion.div initial={false} animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                      <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{answer}</p>
                    </motion.div>
                  </div>
                </AnimItem>
              );
            })}
          </div>
          <AnimSection className="text-center mt-8">
            <p className="text-sm text-muted-foreground">
              Still need help? <a href={`mailto:${get("brand_email", "support@evixpos.com")}`} className="text-primary font-medium hover:underline">Contact Support →</a>
            </p>
          </AnimSection>
        </div>
      </section>}

      {show("cta") && <section className="py-14 sm:py-18 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent" />
        <div className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-primary/8 rounded-full blur-[80px]" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <AnimSection>
            <motion.div whileHover={{ scale: 1.05 }} className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-primary/30 border border-primary/20">
              <Zap className="h-10 w-10 text-primary" />
            </motion.div>
             <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mb-5">
               {get("cta_title", "Ready to Unify Your Online & Offline Business?")}
             </h2>
             <p className="text-muted-foreground text-lg sm:text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
               {get("cta_subtitle", "Join thousands of entrepreneurs who manage their entire business — online store, physical POS, inventory, customers — from one powerful platform.")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={() => navigate("/auth")} className="text-base px-10 h-12 gap-2 shadow-xl shadow-primary/25 hover:shadow-2xl transition-all">
                {get("cta_button", "Start Free Today")} <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/auth")} className="text-base px-10 h-12 gap-2">
                <Headphones className="h-4 w-4" /> {get("cta_button_secondary", "Talk to Sales")}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-8 flex items-center justify-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> {get("cta_trust_1", "Secure & Private")}</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> {get("cta_trust_2", "No Credit Card")}</span>
              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {get("cta_trust_3", "Cancel Anytime")}</span>
            </p>
          </AnimSection>
        </div>
      </section>}

      <Dialog open={!!policyModal} onOpenChange={() => setPolicyModal(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="text-xl font-bold">
              {policyModal === "privacy" && "Privacy Policy"}
              {policyModal === "terms" && "Terms of Service"}
              {policyModal === "refund" && "Refund Policy"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="px-6 pb-6 max-h-[65vh]">
            <div className="prose prose-sm max-w-none text-muted-foreground pt-4">
              {renderPolicyContent(policyModal === "privacy" ? get("privacy_policy", "") : policyModal === "terms" ? get("terms_of_service", "") : get("refund_policy", ""))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      <footer className="relative border-t border-border/40 bg-gradient-to-b from-muted/40 to-muted/80">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-12 sm:py-16 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-12">
            <div className="col-span-2 sm:col-span-2 lg:col-span-3">
              <div className="flex items-center gap-2.5 mb-5">
                <img src={get("brand_logo") || brandLogo} alt={get("brand_name", "EvixPOS")} className="h-9 w-auto" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-xs">{get("footer_tagline", "The all-in-one platform for online & offline business management — orders, POS, customers, inventory, and analytics in one panel.")}</p>
              <a href={`mailto:${get("brand_email", "support@evixpos.com")}`} className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-primary transition-colors group mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary/5 group-hover:bg-primary/10 flex items-center justify-center transition-colors"><Mail className="h-4 w-4" /></div>
                {get("brand_email", "support@evixpos.com")}
              </a>
              <a href={`https://wa.me/${get("brand_whatsapp", "+91 8101949890").replace(/[\s+]/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-primary transition-colors group">
                <div className="w-8 h-8 rounded-lg bg-primary/5 group-hover:bg-primary/10 flex items-center justify-center transition-colors"><MessageSquare className="h-4 w-4" /></div>
                {get("brand_whatsapp", "+91 8101949890")}
              </a>
            </div>
            <div className="lg:col-span-2">
              <h4 className="font-semibold text-sm mb-4 text-foreground tracking-wide uppercase text-[11px]">{get("footer_col1_title", "Product")}</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><button onClick={() => smoothScroll("#features")} className="hover:text-primary transition-colors">{get("nav_features", "Features")}</button></li>
                <li><button onClick={() => smoothScroll("#pricing")} className="hover:text-primary transition-colors">{get("nav_pricing", "Pricing")}</button></li>
                <li><button onClick={() => smoothScroll("#how-it-works")} className="hover:text-primary transition-colors">{get("footer_link_how", "How It Works")}</button></li>
                <li><button onClick={() => smoothScroll("#screenshots")} className="hover:text-primary transition-colors">{get("footer_link_screenshots", "Screenshots")}</button></li>
              </ul>
            </div>
            <div className="lg:col-span-2">
              <h4 className="font-semibold text-sm mb-4 text-foreground tracking-wide uppercase text-[11px]">{get("footer_col2_title", "Company")}</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><button onClick={() => smoothScroll("#about")} className="hover:text-primary transition-colors">{get("nav_about", "About Us")}</button></li>
                <li><button onClick={() => smoothScroll("#testimonials")} className="hover:text-primary transition-colors">{get("nav_reviews", "Reviews")}</button></li>
                <li><button onClick={() => smoothScroll("#faq")} className="hover:text-primary transition-colors">{get("nav_faq", "FAQ")}</button></li>
                <li><a href={`mailto:${get("brand_email", "support@evixpos.com")}`} className="hover:text-primary transition-colors">{get("footer_link_contact", "Contact")}</a></li>
              </ul>
            </div>
            <div className="lg:col-span-2">
              <h4 className="font-semibold text-sm mb-4 text-foreground tracking-wide uppercase text-[11px]">{get("footer_col3_title", "Account")}</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><button onClick={() => navigate("/auth")} className="hover:text-primary transition-colors">{get("footer_link_login", "Login")}</button></li>
                <li><button onClick={() => navigate("/auth")} className="hover:text-primary transition-colors">{get("footer_link_signup", "Sign Up Free")}</button></li>
                <li><button onClick={() => navigate("/dashboard")} className="hover:text-primary transition-colors">{get("footer_link_dashboard", "Dashboard")}</button></li>
              </ul>
            </div>
            <div className="col-span-2 sm:col-span-2 lg:col-span-3">
              <h4 className="font-semibold text-sm mb-4 text-foreground tracking-wide uppercase text-[11px]">{get("footer_why_title", "Why EvixPOS")}</h4>
              <ul className="space-y-2.5 mb-6">
                {(get("footer_highlights", "Online + Offline in One Panel|Multi-Store Support|24/7 Support|Fast & Reliable")).split("|").map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />{item.trim()}</li>
                ))}
              </ul>
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                <p className="text-sm font-medium mb-3">{get("footer_cta_title", "Unify Your Business Today")}</p>
                <Button size="sm" onClick={() => navigate("/auth")} className="gap-1.5 shadow-md shadow-primary/15 w-full">Get Started <ArrowRight className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>
          <div className="border-t border-border/40 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {get("footer_copyright", `© 2026 EvixPOS. All rights reserved.`)} Powered by{" "}
              <a href={get("footer_powered_url", "https://www.lifeaimit.in")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{get("footer_powered_by", "LifeAim IT")}</a>
            </p>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <button onClick={() => setPolicyModal("privacy")} className="hover:text-primary transition-colors">{get("footer_privacy_label", "Privacy Policy")}</button>
              <button onClick={() => setPolicyModal("terms")} className="hover:text-primary transition-colors">{get("footer_terms_label", "Terms of Service")}</button>
              <button onClick={() => setPolicyModal("refund")} className="hover:text-primary transition-colors">{get("footer_refund_label", "Refund Policy")}</button>
            </div>
          </div>
        </div>
      </footer>

      {/* ═══════════════════ STICKY CTA (Mobile) ═══════════════════ */}
      <AnimatePresence>
        {scrolled && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="fixed bottom-0 inset-x-0 z-40 sm:hidden bg-card/90 backdrop-blur-xl border-t border-border/50 px-4 py-3 safe-area-pb">
            <Button className="w-full h-11 gap-2 shadow-lg shadow-primary/20" onClick={() => navigate("/auth")}>
              {get("nav_start_free", "Start Free")} <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {get("hero_video_url") && (
        <VideoModal open={videoOpen} onOpenChange={setVideoOpen} videoUrl={get("hero_video_url")} videoType={get("hero_video_type", "youtube") as "youtube" | "mp4"} thumbnail={get("hero_video_thumbnail") || undefined} title={get("hero_video_title", "EvixPOS Product Demo")} />
      )}
      <LandingChatbot />
    </div>
  );
};

export default LandingPage;
