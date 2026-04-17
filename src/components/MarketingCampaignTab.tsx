import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Users, Mail, Send, Search, Filter, Calendar, Eye, TestTube,
  BarChart3, Clock, CheckCircle2, XCircle, Megaphone, Target,
  TrendingUp, UserCheck, Sparkles, Play, ArrowRight, ChevronDown,
  MailCheck, AlertTriangle, Zap
} from "lucide-react";
import { format, differenceInDays, subDays, isAfter, isBefore } from "date-fns";

// ─── Types ────────────────────────────────────────────────
interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  tags: string | null;
}

interface EmailTemplate {
  id: string;
  store_id: string;
  user_id: string;
  template_type: string;
  subject: string;
  body: string;
  is_active: boolean;
}

interface CampaignHistory {
  id: string;
  created_at: string;
  status: string;
  recipient: string;
  subject: string | null;
  message: string;
  error_message: string | null;
  channel: string;
}

interface TrackingEvent {
  id: string;
  recipient_email: string;
  tracking_type: string;
  link_url: string | null;
  tracked_at: string;
}

// ─── Component ────────────────────────────────────────────
const MarketingCampaignTab = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();

  // Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaignHistory, setCampaignHistory] = useState<CampaignHistory[]>([]);
  const [trackingData, setTrackingData] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection & Filters
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");

  // Campaign Config
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [useCustomContent, setUseCustomContent] = useState(false);

  // Schedule
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");

  // Preview & Test
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  // Campaign Execution
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState({ sent: 0, failed: 0, total: 0 });

  // Sub-tab
  const [subTab, setSubTab] = useState("audience");

  // ─── Fetch Data ──────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user || !activeStore) return;
    setLoading(true);

    const [custRes, tplRes, histRes, trackRes] = await Promise.all([
      supabase.from("customers").select("id, name, email, phone, created_at, tags").eq("store_id", activeStore.id).eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("renewal_email_templates").select("*").eq("store_id", activeStore.id),
      supabase.from("notification_logs").select("*").eq("user_id", user.id).eq("channel", "email").order("created_at", { ascending: false }).limit(500),
      supabase.from("email_campaign_tracking").select("*").eq("store_id", activeStore.id).order("tracked_at", { ascending: false }).limit(1000),
    ]);

    if (custRes.data) setCustomers(custRes.data);
    if (tplRes.data) setTemplates(tplRes.data as any);
    if (histRes.data) setCampaignHistory(histRes.data as any);
    if (trackRes.data) setTrackingData(trackRes.data as any);
    setLoading(false);
  }, [user, activeStore]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Filtered Customers ──────────────────────────────
  const filteredCustomers = useMemo(() => {
    let result = customers;

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
      );
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      let cutoff: Date;
      switch (dateFilter) {
        case "7d": cutoff = subDays(now, 7); break;
        case "30d": cutoff = subDays(now, 30); break;
        case "90d": cutoff = subDays(now, 90); break;
        case "180d": cutoff = subDays(now, 180); break;
        case "365d": cutoff = subDays(now, 365); break;
        default: cutoff = new Date(0);
      }
      result = result.filter(c => isAfter(new Date(c.created_at), cutoff));
    }

    // Tag filter
    if (tagFilter !== "all") {
      result = result.filter(c => c.tags && c.tags.toLowerCase().includes(tagFilter.toLowerCase()));
    }

    return result;
  }, [customers, searchQuery, dateFilter, tagFilter]);

  // Available tags
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    customers.forEach(c => {
      if (c.tags) {
        c.tags.split(",").forEach(t => tags.add(t.trim()));
      }
    });
    return Array.from(tags).filter(Boolean);
  }, [customers]);

  // Email-able customers
  const emailableCustomers = useMemo(() => filteredCustomers.filter(c => c.email), [filteredCustomers]);
  const selectedWithEmail = useMemo(() => selectedCustomers.filter(id => customers.find(c => c.id === id && c.email)), [selectedCustomers, customers]);

  // ─── Selection Helpers ───────────────────────────────
  const toggleCustomer = (id: string) => {
    setSelectedCustomers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    const ids = emailableCustomers.map(c => c.id);
    setSelectedCustomers(ids);
  };

  const deselectAll = () => setSelectedCustomers([]);

  const selectSegment = (segment: string) => {
    const now = new Date();
    let filtered: Customer[];
    switch (segment) {
      case "new":
        filtered = customers.filter(c => c.email && differenceInDays(now, new Date(c.created_at)) <= 30);
        break;
      case "old":
        filtered = customers.filter(c => c.email && differenceInDays(now, new Date(c.created_at)) > 180);
        break;
      case "recent":
        filtered = customers.filter(c => c.email && differenceInDays(now, new Date(c.created_at)) <= 7);
        break;
      default:
        filtered = customers.filter(c => c.email);
    }
    setSelectedCustomers(filtered.map(c => c.id));
    toast.success(`${filtered.length} customer(s) selected`);
  };

  // ─── Template & Preview ──────────────────────────────
  const selectedTemplate = useMemo(() => templates.find(t => t.id === selectedTemplateId), [selectedTemplateId, templates]);

  const emailSubject = useCustomContent ? customSubject : (selectedTemplate?.subject || "");
  const emailBody = useCustomContent ? customBody : (selectedTemplate?.body || "");

  const previewHtml = useMemo(() => {
    return emailBody
      .replace(/\{\{customer_name\}\}/g, "John Doe")
      .replace(/\{\{product_name\}\}/g, "Premium Package")
      .replace(/\{\{expiry_date\}\}/g, "2026-05-01")
      .replace(/\{\{store_name\}\}/g, activeStore?.name || "My Store")
      .replace(/\[CTA:\{[^}]*"text"\s*:\s*"([^"]*)"[^}]*"url"\s*:\s*"([^"]*)"[^}]*"color"\s*:\s*"([^"]*)"[^}]*\}\]/g,
        '<a href="$2" style="display:inline-block;padding:12px 28px;background:$3;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:12px 0;">$1</a>')
      .replace(/\n/g, "<br/>");
  }, [emailBody, activeStore]);

  // ─── Test Send ───────────────────────────────────────
  const handleTestSend = async () => {
    if (!activeStore || !testEmail || !emailSubject) {
      toast.error("Enter test email and select a template");
      return;
    }
    setTestSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-store-email", {
        body: {
          store_id: activeStore.id,
          test_email: testEmail,
          subject: emailSubject.replace(/\{\{product_name\}\}/g, "Test Product"),
          body: emailBody
            .replace(/\{\{customer_name\}\}/g, "Test User")
            .replace(/\{\{product_name\}\}/g, "Test Product")
            .replace(/\{\{expiry_date\}\}/g, new Date().toISOString().split("T")[0])
            .replace(/\{\{store_name\}\}/g, activeStore?.name || "My Store"),
        },
      });
      if (error) throw error;
      if (data?.success) toast.success("✅ Test email sent!");
      else toast.error(`❌ Failed: ${data?.error || "Unknown"}`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setTestSending(false);
  };

  // ─── Run Campaign ────────────────────────────────────
  const runCampaign = async () => {
    if (!user || !activeStore) return;
    if (selectedWithEmail.length === 0) {
      toast.error("Select customers with email addresses");
      return;
    }
    if (!emailSubject || !emailBody) {
      toast.error("Please select a template or write custom content");
      return;
    }

    setCampaignRunning(true);
    setCampaignProgress({ sent: 0, failed: 0, total: selectedWithEmail.length });

    try {
      const { data, error } = await supabase.functions.invoke("send-renewal-reminders", {
        body: {
          store_id: activeStore.id,
          user_id: user.id,
          mode: "campaign",
          campaign_type: "marketing",
          customer_ids: selectedWithEmail,
          template_id: selectedTemplateId || undefined,
          custom_subject: useCustomContent ? customSubject : undefined,
          custom_body: useCustomContent ? customBody : undefined,
          scheduled_at: isScheduled ? `${scheduleDate}T${scheduleTime}:00` : undefined,
        },
      });

      if (error) throw error;

      setCampaignProgress({ sent: data.sent || 0, failed: data.failed || 0, total: data.total || 0 });

      if (isScheduled) {
        toast.success(`📅 Campaign scheduled for ${scheduleDate} ${scheduleTime}`);
      } else if (data.sent > 0) {
        toast.success(`✅ ${data.sent} marketing email(s) sent!`);
      }
      if (data.failed > 0) toast.error(`${data.failed} email(s) failed`);
    } catch (e: any) {
      toast.error(e.message);
    }

    setCampaignRunning(false);
    fetchData();
  };

  // ─── Campaign Stats ──────────────────────────────────
  const campaignStats = useMemo(() => {
    const sent = campaignHistory.filter(h => h.status === "sent" || h.status === "delivered").length;
    const failed = campaignHistory.filter(h => h.status === "failed").length;
    const pending = campaignHistory.filter(h => h.status === "pending").length;
    const opens = trackingData.filter(t => t.tracking_type === "open").length;
    const uniqueOpens = new Set(trackingData.filter(t => t.tracking_type === "open").map(t => t.recipient_email)).size;
    const clicks = trackingData.filter(t => t.tracking_type === "click").length;
    const uniqueClicks = new Set(trackingData.filter(t => t.tracking_type === "click").map(t => t.recipient_email)).size;
    const openRate = sent > 0 ? Math.round((uniqueOpens / sent) * 100) : 0;
    const clickRate = sent > 0 ? Math.round((uniqueClicks / sent) * 100) : 0;
    return { sent, failed, pending, total: campaignHistory.length, opens, uniqueOpens, clicks, uniqueClicks, openRate, clickRate };
  }, [campaignHistory, trackingData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Hero Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">{customers.length}</p>
                <p className="text-xs text-muted-foreground">Customers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Send className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{campaignStats.sent}</p>
                <p className="text-xs text-muted-foreground">Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Eye className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{campaignStats.openRate}%</p>
                <p className="text-xs text-muted-foreground">Open Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Target className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{campaignStats.clickRate}%</p>
                <p className="text-xs text-muted-foreground">Click Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{campaignStats.uniqueOpens}</p>
                <p className="text-xs text-muted-foreground">Unique Opens</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{campaignStats.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sub Tabs */}
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-lg h-auto">
          <TabsTrigger value="audience" className="gap-1 sm:gap-1.5 px-1 sm:px-3 text-xs sm:text-sm flex-col sm:flex-row py-1.5 sm:py-1.5"><Target className="h-3.5 w-3.5" /><span>Audience</span></TabsTrigger>
          <TabsTrigger value="compose" className="gap-1 sm:gap-1.5 px-1 sm:px-3 text-xs sm:text-sm flex-col sm:flex-row py-1.5 sm:py-1.5"><Mail className="h-3.5 w-3.5" /><span>Compose</span></TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1 sm:gap-1.5 px-1 sm:px-3 text-xs sm:text-sm flex-col sm:flex-row py-1.5 sm:py-1.5"><BarChart3 className="h-3.5 w-3.5" /><span>Analytics</span></TabsTrigger>
          <TabsTrigger value="history" className="gap-1 sm:gap-1.5 px-1 sm:px-3 text-xs sm:text-sm flex-col sm:flex-row py-1.5 sm:py-1.5"><Clock className="h-3.5 w-3.5" /><span>History</span></TabsTrigger>
        </TabsList>

        {/* ─── AUDIENCE TAB ─────────────────────────────── */}
        <TabsContent value="audience" className="space-y-4 mt-4">
          {/* Quick Segments */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" />Quick Segments</CardTitle>
              <CardDescription>Quickly select customer groups for targeting</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => selectSegment("new")} className="gap-1.5">
                  <UserCheck className="h-3.5 w-3.5" />New (30 days)
                </Button>
                <Button variant="outline" size="sm" onClick={() => selectSegment("recent")} className="gap-1.5">
                  <Zap className="h-3.5 w-3.5" />Recent (7 days)
                </Button>
                <Button variant="outline" size="sm" onClick={() => selectSegment("old")} className="gap-1.5">
                  <Clock className="h-3.5 w-3.5" />Old (180+ days)
                </Button>
                <Button variant="outline" size="sm" onClick={selectAll} className="gap-1.5">
                  <Users className="h-3.5 w-3.5" />All with Email
                </Button>
                {selectedCustomers.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={deselectAll} className="text-destructive">
                    Clear ({selectedCustomers.length})
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Name, email, phone..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="min-w-[140px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Joined</Label>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="180d">Last 6 months</SelectItem>
                  <SelectItem value="365d">Last year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {availableTags.length > 0 && (
              <div className="min-w-[140px]">
                <Label className="text-xs text-muted-foreground mb-1 block">Tag</Label>
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tags</SelectItem>
                    {availableTags.map(tag => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Selected Info */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-muted/50 rounded-lg px-3 sm:px-4 py-2.5">
            <span className="text-xs sm:text-sm">
              <span className="font-semibold text-primary">{selectedCustomers.length}</span> selected
              {" · "}
              <span className="font-semibold text-green-600">{selectedWithEmail.length}</span> with email
              {" · "}
              <span className="hidden sm:inline">Showing </span><span className="font-medium">{filteredCustomers.length}</span> of {customers.length}
            </span>
            {selectedWithEmail.length > 0 && (
              <Button size="sm" onClick={() => setSubTab("compose")} className="gap-1.5 w-full sm:w-auto">
                Next: Compose <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Customer Table */}
          <Card>
            <ScrollArea className="max-h-[500px]">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedCustomers.length === emailableCustomers.length && emailableCustomers.length > 0}
                        onCheckedChange={(checked) => checked ? selectAll() : deselectAll()}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No customers found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCustomers.map(c => (
                      <TableRow key={c.id} className={selectedCustomers.includes(c.id) ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedCustomers.includes(c.id)}
                            onCheckedChange={() => toggleCustomer(c.id)}
                            disabled={!c.email}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          {c.email ? (
                            <span className="text-sm">{c.email}</span>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">No email</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.phone || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(c.created_at), "dd MMM yyyy")}</TableCell>
                        <TableCell>
                          {c.tags ? (
                            <div className="flex flex-wrap gap-1">
                              {c.tags.split(",").filter(Boolean).slice(0, 2).map(t => (
                                <Badge key={t} variant="secondary" className="text-xs">{t.trim()}</Badge>
                              ))}
                            </div>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        {/* ─── COMPOSE TAB ──────────────────────────────── */}
        <TabsContent value="compose" className="space-y-4 mt-4">
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Left: Config */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Email Content</CardTitle>
                  <CardDescription>Select a template or write custom content</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Switch checked={useCustomContent} onCheckedChange={setUseCustomContent} />
                    <Label className="text-sm">{useCustomContent ? "Custom Content" : "Use Template"}</Label>
                  </div>

                  {!useCustomContent ? (
                    <div>
                      <Label className="text-xs text-muted-foreground">Select Template</Label>
                      <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.filter(t => t.is_active).map(t => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.template_type} — {t.subject.substring(0, 40)}...
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {templates.length === 0 && (
                        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          No templates found. Create one in the Templates tab first.
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label className="text-xs text-muted-foreground">Subject</Label>
                        <Input value={customSubject} onChange={e => setCustomSubject(e.target.value)} placeholder="e.g. Special Offer for {{customer_name}}" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Body</Label>
                        <Textarea value={customBody} onChange={e => setCustomBody(e.target.value)} rows={8} placeholder="Hi {{customer_name}},&#10;&#10;We have an exciting offer for you..." />
                      </div>
                    </>
                  )}

                  <Separator />

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Available Variables</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {["{{customer_name}}", "{{product_name}}", "{{expiry_date}}", "{{store_name}}"].map(v => (
                        <Badge key={v} variant="outline" className="text-xs font-mono cursor-pointer hover:bg-primary/10" onClick={() => {
                          if (useCustomContent) {
                            setCustomBody(prev => prev + " " + v);
                          }
                        }}>{v}</Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Schedule */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" />Schedule</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Switch checked={isScheduled} onCheckedChange={setIsScheduled} />
                    <Label className="text-sm">{isScheduled ? "Scheduled Send" : "Send Immediately"}</Label>
                  </div>
                  {isScheduled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Date</Label>
                        <Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Time</Label>
                        <Input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Test & Send */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Test & Send</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input placeholder="Test email address" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
                    <Button variant="outline" onClick={handleTestSend} disabled={testSending || !emailSubject} className="gap-1.5 shrink-0 w-full sm:w-auto">
                      <TestTube className="h-3.5 w-3.5" />{testSending ? "Sending..." : "Test"}
                    </Button>
                  </div>

                  <Separator />

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-sm">
                      <span className="font-medium">{selectedWithEmail.length}</span> recipients
                    </div>
                    <div className="grid grid-cols-2 sm:flex gap-2">
                      <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={!emailSubject} className="gap-1.5">
                        <Eye className="h-3.5 w-3.5" />Preview
                      </Button>
                      <Button onClick={runCampaign} disabled={campaignRunning || selectedWithEmail.length === 0 || !emailSubject} className="gap-1.5">
                        <Play className="h-3.5 w-3.5" />{campaignRunning ? "Sending..." : (isScheduled ? "Schedule" : "Send")}
                      </Button>
                    </div>
                  </div>

                  {campaignRunning && (
                    <div className="space-y-2">
                      <Progress value={campaignProgress.total > 0 ? ((campaignProgress.sent + campaignProgress.failed) / campaignProgress.total) * 100 : 0} />
                      <p className="text-xs text-muted-foreground text-center">
                        {campaignProgress.sent} sent · {campaignProgress.failed} failed · {campaignProgress.total} total
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Preview */}
            <div>
              <Card className="lg:sticky lg:top-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" />Live Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  {emailSubject ? (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/50 px-4 py-3 border-b">
                        <p className="text-xs text-muted-foreground">Subject</p>
                        <p className="text-sm font-medium">{emailSubject.replace(/\{\{customer_name\}\}/g, "John Doe").replace(/\{\{product_name\}\}/g, "Premium Package")}</p>
                      </div>
                      <div className="p-4 bg-background min-h-[300px]">
                        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Mail className="h-10 w-10 mb-3 opacity-30" />
                      <p className="text-sm">Select a template or write content to preview</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ─── ANALYTICS TAB ─────────────────────────────── */}
        <TabsContent value="analytics" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Open Rate Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" />Open Tracking</CardTitle>
                <CardDescription>Emails opened by recipients (tracked via pixel)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Opens</span>
                    <span className="text-lg font-bold">{campaignStats.opens}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Unique Opens</span>
                    <span className="text-lg font-bold">{campaignStats.uniqueOpens}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Open Rate</span>
                    <span className="text-lg font-bold text-green-600">{campaignStats.openRate}%</span>
                  </div>
                  <Progress value={campaignStats.openRate} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Click Rate Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" />Click Tracking</CardTitle>
                <CardDescription>Links clicked inside emails</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Clicks</span>
                    <span className="text-lg font-bold">{campaignStats.clicks}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Unique Clicks</span>
                    <span className="text-lg font-bold">{campaignStats.uniqueClicks}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Click Rate</span>
                    <span className="text-lg font-bold text-purple-600">{campaignStats.clickRate}%</span>
                  </div>
                  <Progress value={campaignStats.clickRate} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Tracking Events */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Tracking Events</CardTitle>
              <CardDescription>Live feed of email opens and link clicks</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Link</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trackingData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          No tracking data yet. Send a campaign to start tracking.
                        </TableCell>
                      </TableRow>
                    ) : (
                      trackingData.slice(0, 100).map(t => (
                        <TableRow key={t.id}>
                          <TableCell>
                            <Badge variant={t.tracking_type === "open" ? "default" : "secondary"} className="gap-1 text-xs">
                              {t.tracking_type === "open" ? <Eye className="h-3 w-3" /> : <Target className="h-3 w-3" />}
                              {t.tracking_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{t.recipient_email}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{t.link_url || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{format(new Date(t.tracked_at), "dd MMM HH:mm")}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── HISTORY TAB ──────────────────────────────── */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-5 pb-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{campaignStats.sent}</p>
                  <p className="text-xs text-muted-foreground">Delivered</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{campaignStats.failed}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{campaignStats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* History Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Campaign History</CardTitle>
              <CardDescription>All marketing emails sent from this store</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          No campaigns sent yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      campaignHistory.map(h => (
                        <TableRow key={h.id}>
                          <TableCell className="font-medium">{h.subject || "—"}</TableCell>
                          <TableCell className="text-sm">{h.recipient || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={h.status === "sent" || h.status === "delivered" ? "default" : h.status === "failed" ? "destructive" : "secondary"} className="gap-1 text-xs">
                              {h.status === "sent" || h.status === "delivered" ? <CheckCircle2 className="h-3 w-3" /> : h.status === "failed" ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                              {h.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(h.created_at), "dd MMM yyyy HH:mm")}
                          </TableCell>
                          <TableCell className="text-xs text-destructive max-w-[200px] truncate">{h.error_message || "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5" />Email Preview</DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-3 border-b">
              <p className="text-xs text-muted-foreground">To: {selectedWithEmail.length} recipient(s)</p>
              <p className="text-sm font-medium mt-1">Subject: {emailSubject.replace(/\{\{customer_name\}\}/g, "John Doe").replace(/\{\{product_name\}\}/g, "Premium Package")}</p>
            </div>
            <div className="p-6 bg-background">
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MarketingCampaignTab;
