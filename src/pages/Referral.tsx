import { useEffect, useState, useCallback } from "react";
import { useMemo } from "react";
import { usePagination, paginate } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/data-pagination";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Gift, Copy, Wallet, History, MousePointerClick, UserPlus, UserCheck, Star,
  DollarSign, TrendingUp, Share2, Users, Clock, CheckCircle, XCircle, Link as LinkIcon,
  Trophy, BookOpen, ArrowRight, Sparkles, Lightbulb, X, Target, Crown, QrCode,
  Zap, Award, Mail, MessageCircle, Send, Twitter, Linkedin, Facebook,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { WITHDRAW_METHODS, getMethodById, getGroupedMethods } from "@/lib/withdrawMethods";

const generateCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

interface ReferralSettings {
  id: string;
  referral_code: string;
  total_clicks: number;
  total_earnings: number;
  pending_balance: number;
  commission_rate: number;
  min_withdraw: number;
}

const STEPS = [
  { icon: Copy, title: "Copy Your Link", desc: "Click the copy button to get your unique referral link or code." },
  { icon: Share2, title: "Share With Friends", desc: "Send your link via WhatsApp, Facebook, or any channel you prefer." },
  { icon: UserPlus, title: "Friends Sign Up", desc: "When someone signs up using your link, they become your referral." },
  { icon: DollarSign, title: "Earn Commission", desc: "You earn commission when your referral purchases a premium plan." },
];

const Referral = () => {
  const { user } = useAuth();
  const { symbol, format: fmtCurrency } = useCurrency();
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [withdrawMethod, setWithdrawMethod] = useState("bkash");
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [withdrawDetails, setWithdrawDetails] = useState<Record<string, string>>({});
  const [withdrawNotes, setWithdrawNotes] = useState("");
  const [filter, setFilter] = useState("all");
  const [guideOpen, setGuideOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    let { data: s } = await supabase.from("referral_settings").select("*").eq("user_id", user.id).maybeSingle();
    if (!s) {
      const code = generateCode();
      const { data: newS } = await supabase.from("referral_settings").insert({
        user_id: user.id, referral_code: code,
      }).select().single();
      s = newS;
    }
    if (s) setSettings(s as ReferralSettings);

    const { data: refs } = await supabase.from("referrals").select("*").eq("referrer_id", user.id).order("created_at", { ascending: false });
    if (refs) setReferrals(refs);

    const { data: ws } = await supabase.from("referral_withdrawals").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (ws) setWithdrawals(ws);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Always use main production domain for referral links
  const getBaseUrl = () => "https://evixpos.com";
  const referralLink = settings ? `${getBaseUrl()}/auth?tab=signup&ref=${settings.referral_code}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Referral link copied!");
  };

  const copyCode = () => {
    if (!settings) return;
    navigator.clipboard.writeText(settings.referral_code);
    toast.success("Referral code copied!");
  };

  const selectedMethod = getMethodById(withdrawMethod);
  const hasPendingWithdrawal = withdrawals.some(w => w.status === "pending");

  const resetWithdrawForm = () => {
    setWithdrawAmount(0);
    setWithdrawMethod("bkash");
    setWithdrawDetails({});
    setWithdrawNotes("");
  };

  const isWithdrawValid = () => {
    if (!settings) return false;
    if (withdrawAmount < settings.min_withdraw) return false;
    if (withdrawAmount > settings.pending_balance) return false;
    if (!selectedMethod) return false;
    return selectedMethod.fields.filter(f => f.required).every(f => withdrawDetails[f.key]?.trim());
  };

  const requestWithdraw = async () => {
    if (!user || !settings || !selectedMethod) return;
    if (hasPendingWithdrawal) {
      toast.error("You already have a pending withdrawal request");
      return;
    }
    if (withdrawAmount < settings.min_withdraw) {
      toast.error(`Minimum withdrawal is ${fmtCurrency(settings.min_withdraw)}`);
      return;
    }
    if (withdrawAmount > settings.pending_balance) {
      toast.error("Insufficient balance");
      return;
    }
    const missingField = selectedMethod.fields.find(f => f.required && !withdrawDetails[f.key]?.trim());
    if (missingField) {
      toast.error(`Please fill: ${missingField.label}`);
      return;
    }

    const { error } = await supabase.from("referral_withdrawals").insert({
      user_id: user.id,
      amount: withdrawAmount,
      method: withdrawMethod,
      account_number: JSON.stringify(withdrawDetails),
      notes: withdrawNotes,
    });
    if (error) { toast.error(error.message); return; }

    await supabase.from("referral_settings").update({
      pending_balance: settings.pending_balance - withdrawAmount,
    }).eq("id", settings.id);

    toast.success("Withdrawal request submitted!");
    setWithdrawOpen(false);
    resetWithdrawForm();
    fetchData();
  };

  const shareOnWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Join and grow your business! Sign up using my referral link: ${referralLink}`)}`, "_blank");
  };

  const shareOnFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`, "_blank");
  };

  const totalSignups = referrals.length;
  const activeUsers = referrals.filter((r) => r.status === "active").length;
  const pendingUsers = referrals.filter((r) => r.status === "pending").length;
  const premiumUsers = referrals.filter((r) => r.plan !== "free").length;

  const filteredReferrals = filter === "all" ? referrals : referrals.filter((r) => r.status === filter);

  const refPagination = usePagination(filteredReferrals.length, {
    storageKey: `pg:referrals:${user?.id ?? "none"}`,
    filterSignature: JSON.stringify({ filter }),
  });
  const pagedReferrals = useMemo(
    () => paginate(filteredReferrals, refPagination.page, refPagination.pageSize),
    [filteredReferrals, refPagination.page, refPagination.pageSize],
  );

  const statusIcon = (status: string) => {
    if (status === "active") return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    if (status === "pending") return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  };

  // ─── Advanced metrics ───
  const conversionRate = settings?.total_clicks ? Math.round((totalSignups / settings.total_clicks) * 100) : 0;
  const premiumConversion = totalSignups ? Math.round((premiumUsers / totalSignups) * 100) : 0;
  const tierThresholds = [
    { name: "Bronze", min: 0, color: "from-orange-400 to-amber-600", icon: "🥉" },
    { name: "Silver", min: 5, color: "from-slate-300 to-slate-500", icon: "🥈" },
    { name: "Gold", min: 15, color: "from-yellow-400 to-amber-500", icon: "🥇" },
    { name: "Platinum", min: 30, color: "from-cyan-300 to-blue-500", icon: "💎" },
    { name: "Diamond", min: 50, color: "from-fuchsia-400 to-violet-600", icon: "👑" },
  ];
  const currentTierIndex = tierThresholds.reduce((acc, t, i) => premiumUsers >= t.min ? i : acc, 0);
  const currentTier = tierThresholds[currentTierIndex];
  const nextTier = tierThresholds[currentTierIndex + 1];
  const tierProgress = nextTier ? Math.min(100, ((premiumUsers - currentTier.min) / (nextTier.min - currentTier.min)) * 100) : 100;
  const referralsToNext = nextTier ? nextTier.min - premiumUsers : 0;

  const qrUrl = referralLink ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(referralLink)}` : "";

  const shareChannels = [
    { name: "WhatsApp", icon: MessageCircle, color: "bg-emerald-500", action: shareOnWhatsApp },
    { name: "Facebook", icon: Facebook, color: "bg-blue-600", action: shareOnFacebook },
    { name: "Twitter", icon: Twitter, color: "bg-sky-500", action: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Grow your business with EvixPOS — sign up via my link: ${referralLink}`)}`, "_blank") },
    { name: "LinkedIn", icon: Linkedin, color: "bg-blue-700", action: () => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`, "_blank") },
    { name: "Telegram", icon: Send, color: "bg-sky-600", action: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Join EvixPOS — try this!")}`, "_blank") },
    { name: "Email", icon: Mail, color: "bg-slate-600", action: () => window.open(`mailto:?subject=${encodeURIComponent("Try EvixPOS")}&body=${encodeURIComponent(`Sign up using my referral link: ${referralLink}`)}`) },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6 pb-8">
        {/* ─── Premium Hero Header ─── */}
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                <Gift className="h-6 w-6 sm:h-7 sm:w-7 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Referral Dashboard</h1>
                  <Badge variant="outline" className="gap-1 text-[10px] font-semibold border-primary/30 text-primary bg-primary/5">
                    <Sparkles className="h-3 w-3" /> EARN {settings?.commission_rate || 20}%
                  </Badge>
                  <Badge variant="outline" className={`gap-1 text-[10px] font-bold border-amber-400/40 text-amber-600 bg-amber-50 dark:bg-amber-950/30`}>
                    <span>{currentTier.icon}</span> {currentTier.name} Tier
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Refer & earn <strong className="text-foreground">{settings?.commission_rate || 20}%</strong> commission on every premium signup
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setGuideOpen(g => !g)} className="gap-1.5">
                <BookOpen className="h-4 w-4" /> Guide
              </Button>
              <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="gap-1.5">
                <History className="h-4 w-4" /> History
              </Button>
              <Button size="sm" onClick={() => { if (settings) { setWithdrawAmount(settings.pending_balance); setWithdrawOpen(true); } }} className="gap-1.5 shadow-sm">
                <Wallet className="h-4 w-4" /> Withdraw
              </Button>
            </div>
          </div>

          {/* Tier progress strip */}
          <div className="relative mt-5 rounded-xl bg-background/60 backdrop-blur-sm border border-border/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <p className="text-xs font-semibold">Tier Progress</p>
              </div>
              {nextTier ? (
                <p className="text-[11px] text-muted-foreground">
                  <strong className="text-foreground">{referralsToNext}</strong> premium referrals to <span className="font-semibold">{nextTier.icon} {nextTier.name}</span>
                </p>
              ) : (
                <Badge className="gap-1 text-[10px] bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white border-0">
                  <Crown className="h-3 w-3" /> Max tier reached
                </Badge>
              )}
            </div>
            <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
              <div className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${currentTier.color} transition-all duration-500`} style={{ width: `${tierProgress}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
              {tierThresholds.map((tier, i) => (
                <span key={tier.name} className={i <= currentTierIndex ? "font-semibold text-foreground" : ""}>
                  {tier.icon} {tier.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Collapsible Guide Panel ─── */}
        {guideOpen && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent animate-in fade-in slide-in-from-top-2 duration-300">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <Lightbulb className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">How the Referral Program Works</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Earn <strong>{settings?.commission_rate || 20}%</strong> commission lifetime. Min withdraw {fmtCurrency(settings?.min_withdraw || 500)}.
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setGuideOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {STEPS.map((step, i) => (
                  <div key={i} className="flex gap-2.5 p-3 rounded-lg bg-background/70 border border-border/40">
                    <div className="h-7 w-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <step.icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">Step {i + 1}: {step.title}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="text-muted-foreground"><strong className="text-foreground">Lifetime</strong> commissions</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
                  <Zap className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <span className="text-muted-foreground"><strong className="text-foreground">Instant</strong> tracking</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <Award className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="text-muted-foreground">Higher tier = <strong className="text-foreground">bonus rewards</strong></span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Stats Grid (premium) ─── */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Total Clicks", value: settings?.total_clicks || 0, icon: MousePointerClick, color: "text-rose-500", bg: "bg-rose-500/10", trend: null },
            { label: "Signups", value: totalSignups, icon: UserPlus, color: "text-blue-500", bg: "bg-blue-500/10", trend: `${conversionRate}% CR` },
            { label: "Active", value: activeUsers, icon: UserCheck, color: "text-emerald-500", bg: "bg-emerald-500/10", trend: null },
            { label: "Premium", value: premiumUsers, icon: Star, color: "text-amber-500", bg: "bg-amber-500/10", trend: `${premiumConversion}%` },
            { label: "Earnings", value: fmtCurrency(settings?.total_earnings || 0), icon: DollarSign, color: "text-violet-500", bg: "bg-violet-500/10", trend: null },
          ].map((stat) => (
            <Card key={stat.label} className="border-border/50 hover:shadow-md transition-all rounded-xl h-full">
              <CardContent className="px-3 py-3 h-full flex items-center gap-3">
                <div className={`h-9 w-9 shrink-0 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground leading-tight truncate">{stat.label}</p>
                    {stat.trend && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 font-semibold shrink-0">{stat.trend}</Badge>
                    )}
                  </div>
                  <p className="text-base font-bold tabular-nums leading-tight truncate">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ─── Referral Link + QR (premium) ─── */}
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5 rounded-2xl">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <LinkIcon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm">Your Unique Referral Link</h2>
                  <p className="text-[11px] text-muted-foreground">Share this everywhere — every signup tracks back to you</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2.5 border border-border/40 min-w-0">
                  <Badge className="shrink-0 bg-primary/15 text-primary border-0 hover:bg-primary/20">CODE: {settings?.referral_code || "..."}</Badge>
                  <Input value={referralLink} readOnly className="border-0 bg-transparent font-mono text-xs p-0 h-auto focus-visible:ring-0 shadow-none truncate" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={copyLink} className="gap-1.5 shrink-0"><Copy className="h-3.5 w-3.5" /> Copy Link</Button>
                  <Button variant="outline" onClick={copyCode} className="gap-1.5 shrink-0"><Copy className="h-3.5 w-3.5" /> Code</Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <Wallet className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Withdrawable</p>
                    <p className="text-sm font-bold truncate">{fmtCurrency(settings?.pending_balance || 0)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/20">
                  <Target className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Min. Withdraw</p>
                    <p className="text-sm font-bold truncate">{fmtCurrency(settings?.min_withdraw || 500)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* QR Code card (desktop) */}
          <Card className="hidden lg:block border-border/50 rounded-2xl w-[200px]">
            <CardContent className="p-5 flex flex-col items-center text-center gap-2">
              <div className="flex items-center gap-1.5">
                <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Scan QR</p>
              </div>
              {qrUrl && (
                <img src={qrUrl} alt="Referral QR" className="w-[140px] h-[140px] rounded-lg bg-white p-1.5 border" />
              )}
              <p className="text-[10px] text-muted-foreground">Mobile-friendly sharing</p>
            </CardContent>
          </Card>
        </div>

        {/* ─── Share Channels Grid ─── */}
        <Card className="border-border/50 rounded-2xl">
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Share2 className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-sm">Share & Promote</h2>
                <p className="text-[11px] text-muted-foreground">One click to share via your favorite platform</p>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {shareChannels.map((ch) => (
                <button
                  key={ch.name}
                  onClick={ch.action}
                  className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-border/40 hover:border-primary/40 hover:shadow-md transition-all bg-card"
                >
                  <div className={`h-10 w-10 rounded-xl ${ch.color} text-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
                    <ch.icon className="h-4 w-4" />
                  </div>
                  <span className="text-[11px] font-medium">{ch.name}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

      {/* Top Referrers / Leaderboard */}
      {referrals.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-yellow-500" />Your Referral Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 text-center">
                <p className="text-2xl font-bold text-green-600">{activeUsers}</p>
                <p className="text-xs text-muted-foreground mt-1">Active Referrals</p>
              </div>
              <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 text-center">
                <p className="text-2xl font-bold text-yellow-600">{pendingUsers}</p>
                <p className="text-xs text-muted-foreground mt-1">Pending Approval</p>
              </div>
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-center">
                <p className="text-2xl font-bold text-blue-600">{fmtCurrency(settings?.pending_balance || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Available to Withdraw</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Referral Performance Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Referral Performance</CardTitle>
              <CardDescription>Track all your referred users and earnings.</CardDescription>
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredReferrals.length === 0 ? (
            <div className="text-center py-12">
              <UserPlus className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-medium">No referrals yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Share your referral link to start earning commissions.</p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {pagedReferrals.map((r) => (
                  <div key={r.id} className="border rounded-2xl bg-card p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">{r.referred_email}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM dd, yyyy")}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {statusIcon(r.status)}
                        <span className="text-xs capitalize">{r.status}</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Plan: <Badge variant={r.plan === "free" ? "secondary" : "default"} className="text-[10px] h-5">{r.plan}</Badge></span>
                      <span>Commission: <strong>{fmtCurrency(r.commission_amount)}</strong></span>
                    </div>
                    <div className="flex justify-end">
                      <Badge variant={r.is_paid ? "default" : "outline"} className="text-[10px]">{r.is_paid ? "Paid" : "Unpaid"}</Badge>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Referred Email</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedReferrals.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{format(new Date(r.created_at), "MMM dd, yyyy")}</TableCell>
                        <TableCell className="text-sm">{r.referred_email}</TableCell>
                        <TableCell><Badge variant={r.plan === "free" ? "secondary" : "default"}>{r.plan}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {statusIcon(r.status)}
                            <span className="text-sm capitalize">{r.status}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{fmtCurrency(r.commission_amount)}</TableCell>
                        <TableCell>
                          <Badge variant={r.is_paid ? "default" : "outline"}>{r.is_paid ? "Paid" : "Unpaid"}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {filteredReferrals.length > 0 && (
                <DataPagination
                  page={refPagination.page}
                  pageSize={refPagination.pageSize}
                  total={filteredReferrals.length}
                  onPageChange={refPagination.setPage}
                  onPageSizeChange={refPagination.setPageSize}
                  itemLabel="referrals"
                  className="mt-3"
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Withdraw Dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Withdraw Earnings</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/30 p-3 rounded-lg text-sm">
              Available balance: <strong>{fmtCurrency(settings?.pending_balance || 0)}</strong>
              <br />Minimum withdrawal: <strong>{fmtCurrency(settings?.min_withdraw || 500)}</strong>
            </div>

            {hasPendingWithdrawal && (
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 p-3 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
                ⚠️ You have a pending withdrawal. Please wait for it to be processed.
              </div>
            )}

            <div className="space-y-2">
              <Label>Amount ({symbol})</Label>
              <Input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(Number(e.target.value))} min={0} />
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={withdrawMethod} onValueChange={(v) => { setWithdrawMethod(v); setWithdrawDetails({}); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getGroupedMethods().map(group => (
                    <SelectGroup key={group.label}>
                      <SelectLabel className="text-xs font-bold">{group.label}</SelectLabel>
                      {group.methods.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          <span className="flex items-center gap-2">
                            <span>{m.emoji}</span>
                            <span>{m.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Fields */}
            {selectedMethod && selectedMethod.fields.map(field => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label} {field.required && <span className="text-destructive">*</span>}</Label>
                <Input
                  type={field.type || "text"}
                  value={withdrawDetails[field.key] || ""}
                  onChange={(e) => setWithdrawDetails(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                />
              </div>
            ))}

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={withdrawNotes} onChange={(e) => setWithdrawNotes(e.target.value)} rows={2} />
            </div>

            <Button
              className="w-full"
              onClick={requestWithdraw}
              disabled={!isWithdrawValid() || hasPendingWithdrawal}
            >
              Submit Withdrawal Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Withdrawal History</DialogTitle></DialogHeader>
          {withdrawals.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">No withdrawal history.</p>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((w) => {
                const method = getMethodById(w.method);
                let details: Record<string, string> = {};
                try { details = JSON.parse(w.account_number || "{}"); } catch { details = { account: w.account_number }; }
                return (
                  <div key={w.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{method?.emoji || "💳"}</span>
                        <span className="font-medium text-sm">{method?.label || w.method}</span>
                      </div>
                      <Badge variant={w.status === "completed" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>
                        {w.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{format(new Date(w.created_at), "MMM dd, yyyy")}</span>
                      <span className="font-semibold">{fmtCurrency(w.amount)}</span>
                    </div>
                    {Object.keys(details).length > 0 && (
                      <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 space-y-0.5">
                        {Object.entries(details).map(([k, v]) => (
                          <div key={k}><span className="capitalize">{k.replace(/_/g, " ")}:</span> {v}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Referral;
