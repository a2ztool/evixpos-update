import { useEffect, useState, useCallback } from "react";
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

  // Use published domain if available, fallback to current origin
  const getBaseUrl = () => {
    const origin = window.location.origin;
    // If on preview/lovableproject domain, use published URL
    if (origin.includes("lovable.app") && origin.includes("preview")) {
      return "https://evipose.lovable.app";
    }
    return origin;
  };
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

  const statusIcon = (status: string) => {
    if (status === "active") return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    if (status === "pending") return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  };

  return (
    <DashboardLayout>
      <div className="hidden sm:block mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Gift className="h-8 w-8" /> Referral Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Earn <strong>{settings?.commission_rate || 20}%</strong> commission for every user who signs up via your link and purchases a premium plan.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5 mb-6">
        {[
          { label: "TOTAL CLICKS", value: settings?.total_clicks || 0, icon: MousePointerClick, color: "text-red-500" },
          { label: "TOTAL SIGNUPS", value: totalSignups, icon: UserPlus, color: "text-blue-500" },
          { label: "ACTIVE REFERRALS", value: activeUsers, icon: UserCheck, color: "text-green-500" },
          { label: "PREMIUM USERS", value: premiumUsers, icon: Star, color: "text-yellow-500" },
          { label: "TOTAL EARNING", value: fmtCurrency(settings?.total_earnings || 0), icon: DollarSign, color: "text-emerald-500" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Referral Link */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5" />
            <h2 className="font-semibold text-lg">Your Referral Link</h2>
          </div>

          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
            <div className="flex-1 flex items-center gap-2 bg-muted/30 rounded-lg px-4 py-2.5 border min-w-0 w-full">
              <Badge variant="default" className="shrink-0">Refer & Earn Money</Badge>
              <Input value={referralLink} readOnly className="border-0 bg-transparent font-mono text-xs p-0 h-auto focus-visible:ring-0 shadow-none" />
            </div>
            <div className="flex gap-2 shrink-0">
              <Button onClick={copyLink} className="gap-2"><Copy className="h-4 w-4" />Copy</Button>
              <Button variant="outline" onClick={() => {
                if (!settings) return;
                setWithdrawAmount(settings.pending_balance);
                setWithdrawOpen(true);
              }}>
                <Wallet className="h-4 w-4 mr-2" />Withdraw Earning
              </Button>
              <Button variant="outline" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4 mr-2" />History
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <p className="text-sm text-muted-foreground">
              Your pending withdrawable balance: <strong className="text-foreground">{fmtCurrency(settings?.pending_balance || 0)}</strong>{" "}
              (Min: {fmtCurrency(settings?.min_withdraw || 500)})
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Commission Info Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="border-green-200">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-green-600">{settings?.commission_rate || 20}%</p>
            <p className="text-sm text-muted-foreground mt-1">Commission Rate</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-blue-600">{fmtCurrency(settings?.min_withdraw || 500)}</p>
            <p className="text-sm text-muted-foreground mt-1">Min. Withdraw</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-orange-600">{settings?.referral_code || "..."}</p>
            <p className="text-sm text-muted-foreground mt-1">Your Referral Code</p>
          </CardContent>
        </Card>
      </div>

      {/* Share Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Share2 className="h-5 w-5" />Share Your Link</CardTitle>
          <CardDescription>Share your referral link on social media to earn more.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={shareOnWhatsApp} className="bg-green-600 hover:bg-green-700 text-white">WhatsApp</Button>
            <Button onClick={shareOnFacebook} className="bg-blue-600 hover:bg-blue-700 text-white">Facebook</Button>
            <Button variant="outline" onClick={copyCode}><Copy className="h-4 w-4 mr-2" />Copy Code</Button>
            <Button variant="outline" onClick={copyLink}><LinkIcon className="h-4 w-4 mr-2" />Copy Link</Button>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" />How It Works</CardTitle>
          <CardDescription>Follow these simple steps to start earning.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div key={i} className="relative flex flex-col items-center text-center p-4 rounded-xl bg-muted/30 border">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-bold text-primary mb-1">Step {i + 1}</span>
                <h4 className="font-semibold text-sm">{step.title}</h4>
                <p className="text-xs text-muted-foreground mt-1">{step.desc}</p>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/40" />
                )}
              </div>
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
                {filteredReferrals.map((r) => (
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
                    {filteredReferrals.map((r) => (
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
    </DashboardLayout>
  );
};

export default Referral;
