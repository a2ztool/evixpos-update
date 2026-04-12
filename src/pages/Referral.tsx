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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Gift, Copy, Wallet, History, MousePointerClick, UserPlus, UserCheck, Star,
  DollarSign, TrendingUp, Share2, Users, Clock, CheckCircle, XCircle, Link as LinkIcon,
  Trophy, BookOpen, ArrowRight,
} from "lucide-react";
import { format } from "date-fns";

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
  const [withdrawForm, setWithdrawForm] = useState({ amount: 0, method: "bkash", account_number: "", notes: "" });
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

  const referralLink = settings ? `${window.location.origin}/auth?tab=signup&ref=${settings.referral_code}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Referral link copied!");
  };

  const copyCode = () => {
    if (!settings) return;
    navigator.clipboard.writeText(settings.referral_code);
    toast.success("Referral code copied!");
  };

  const requestWithdraw = async () => {
    if (!user || !settings) return;
    if (withdrawForm.amount < settings.min_withdraw) {
      toast.error(`Minimum withdrawal is ${fmtCurrency(settings.min_withdraw)}`);
      return;
    }
    if (withdrawForm.amount > settings.pending_balance) {
      toast.error("Insufficient balance");
      return;
    }
    if (!withdrawForm.account_number) {
      toast.error("Enter account number");
      return;
    }

    const { error } = await supabase.from("referral_withdrawals").insert({
      user_id: user.id,
      amount: withdrawForm.amount,
      method: withdrawForm.method,
      account_number: withdrawForm.account_number,
      notes: withdrawForm.notes,
    });
    if (error) { toast.error(error.message); return; }

    await supabase.from("referral_settings").update({
      pending_balance: settings.pending_balance - withdrawForm.amount,
    }).eq("id", settings.id);

    toast.success("Withdrawal request submitted!");
    setWithdrawOpen(false);
    setWithdrawForm({ amount: 0, method: "bkash", account_number: "", notes: "" });
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
      <div className="mb-6">
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
                setWithdrawForm({ ...withdrawForm, amount: settings.pending_balance });
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
          )}
        </CardContent>
      </Card>

      {/* Withdraw Dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Withdraw Earnings</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/30 p-3 rounded-lg text-sm">
              Available balance: <strong>{fmtCurrency(settings?.pending_balance || 0)}</strong>
              <br />Minimum withdrawal: <strong>{fmtCurrency(settings?.min_withdraw || 500)}</strong>
            </div>
            <div className="space-y-2">
              <Label>Amount ({symbol})</Label>
              <Input type="number" value={withdrawForm.amount} onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: Number(e.target.value) })} min={0} />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={withdrawForm.method} onValueChange={(v) => setWithdrawForm({ ...withdrawForm, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bkash">bKash</SelectItem>
                  <SelectItem value="nagad">Nagad</SelectItem>
                  <SelectItem value="rocket">Rocket</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input value={withdrawForm.account_number} onChange={(e) => setWithdrawForm({ ...withdrawForm, account_number: e.target.value })} placeholder="01XXXXXXXXX" />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={withdrawForm.notes} onChange={(e) => setWithdrawForm({ ...withdrawForm, notes: e.target.value })} rows={2} />
            </div>
            <Button className="w-full" onClick={requestWithdraw}>Submit Withdrawal Request</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Withdrawal History</DialogTitle></DialogHeader>
          {withdrawals.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">No withdrawal history.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-sm">{format(new Date(w.created_at), "MMM dd, yyyy")}</TableCell>
                    <TableCell className="text-sm font-medium">{fmtCurrency(w.amount)}</TableCell>
                    <TableCell className="text-sm capitalize">{w.method}</TableCell>
                    <TableCell>
                      <Badge variant={w.status === "completed" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>
                        {w.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Referral;
