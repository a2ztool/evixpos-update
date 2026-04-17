import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Bot, Mail, Send, CheckCircle2, XCircle, Clock, AlertTriangle,
  Play, Settings, FileText, RefreshCw, Zap, Users, MailCheck,
  Trash2, Pencil, Eye, Wifi, WifiOff, TestTube, Shield, MessageCircle, ExternalLink, Palette, Megaphone
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import EmailTemplateEditor from "@/components/EmailTemplateEditor";
import EmailBrandingTab from "@/components/EmailBrandingTab";
import MarketingCampaignTab from "@/components/MarketingCampaignTab";
import BotGuidePanel from "@/components/bot-automation/BotGuidePanel";

// ─── Types ────────────────────────────────────────────────
interface EmailConfig {
  id?: string;
  store_id: string;
  user_id: string;
  provider_type: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  api_key: string;
  sender_email: string;
  sender_name: string;
  rate_limit_per_minute: number;
  connection_status: string;
  last_tested_at: string | null;
}

interface AutomationConfig {
  id?: string;
  store_id: string;
  user_id: string;
  is_auto_mode: boolean;
  is_active: boolean;
  schedule_time: string;
  reminder_days: number[];
}

interface EmailTemplate {
  id?: string;
  store_id: string;
  user_id: string;
  template_type: string;
  subject: string;
  body: string;
  is_active: boolean;
}

interface RenewalReminder {
  id: string;
  subscription_id: string;
  customer_id: string | null;
  reminder_type: string;
  channel: string;
  status: string;
  error_message: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  product_name: string | null;
  expiry_date: string | null;
  sent_at: string | null;
  created_at: string;
}

interface Subscription {
  id: string;
  customer_id: string | null;
  product_name: string;
  end_date: string | null;
  status: string;
  customers?: { id: string; name: string; email: string | null; phone: string | null } | null;
}

// ─── Default Templates ────────────────────────────────────
const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  first_reminder: {
    subject: "Subscription Expiring Soon - {{product_name}}",
    body: "Hi {{customer_name}},\n\nYour subscription for \"{{product_name}}\" will expire on {{expiry_date}}.\n\nPlease renew to continue enjoying our services.\n\nThank you!",
  },
  second_reminder: {
    subject: "Reminder: {{product_name}} Expiring Tomorrow",
    body: "Hi {{customer_name}},\n\nThis is a reminder that your subscription for \"{{product_name}}\" expires tomorrow ({{expiry_date}}).\n\nRenew now to avoid service interruption.\n\nThank you!",
  },
  final_reminder: {
    subject: "Final Notice: {{product_name}} Expires Today",
    body: "Hi {{customer_name}},\n\nYour subscription for \"{{product_name}}\" expires today ({{expiry_date}}).\n\nPlease renew immediately to continue your service.\n\nThank you!",
  },
  expired: {
    subject: "{{product_name}} Has Expired",
    body: "Hi {{customer_name}},\n\nYour subscription for \"{{product_name}}\" has expired on {{expiry_date}}.\n\nRenew now to restore your service.\n\nThank you!",
  },
  campaign: {
    subject: "Renew Your {{product_name}} Subscription",
    body: "Hi {{customer_name}},\n\nWe noticed your subscription for \"{{product_name}}\" needs renewal.\n\nRenew today for uninterrupted service.\n\nThank you!",
  },
};

const templateLabels: Record<string, string> = {
  first_reminder: "First Reminder (T-7 days)",
  second_reminder: "Second Reminder (T-3 days)",
  final_reminder: "Final Reminder (T-1 day)",
  expired: "Expired Notice",
  campaign: "Campaign Email",
};

const providerLabels: Record<string, string> = {
  smtp: "Custom SMTP",
  gmail: "Gmail SMTP",
  outlook: "Outlook SMTP",
  sendgrid: "SendGrid API",
  resend: "Resend API",
};

const providerDefaults: Record<string, { host: string; port: number }> = {
  smtp: { host: "", port: 587 },
  gmail: { host: "smtp.gmail.com", port: 587 },
  outlook: { host: "smtp.office365.com", port: 587 },
  sendgrid: { host: "", port: 0 },
  resend: { host: "", port: 0 },
};

// ─── Component ────────────────────────────────────────────
const BotAutomation = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const [activeTab, setActiveTab] = useState("dashboard");

  // Email Config
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);
  const [emailForm, setEmailForm] = useState({
    provider_type: "smtp",
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_pass: "",
    api_key: "",
    sender_email: "",
    sender_name: "",
    rate_limit_per_minute: 30,
  });
  const [testEmail, setTestEmail] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);

  // Automation Config
  const [autoConfig, setAutoConfig] = useState<AutomationConfig | null>(null);

  // Templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  // Reminders / Tracking
  const [reminders, setReminders] = useState<RenewalReminder[]>([]);
  const [trackingTab, setTrackingTab] = useState("delivered");

  // Subscriptions for renewal detection
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  // Campaign state
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState({ sent: 0, failed: 0, total: 0 });
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [campaignPreviewOpen, setCampaignPreviewOpen] = useState(false);
  const [campaignTestEmail, setCampaignTestEmail] = useState("");
  const [campaignTestSending, setCampaignTestSending] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("");
  const [isScheduled, setIsScheduled] = useState(false);

  // ─── Fetch Data ──────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!user || !activeStore) return;
    const storeId = activeStore.id;

    const [emailRes, autoRes, tplRes, remRes, subRes] = await Promise.all([
      supabase.from("email_store_config").select("*").eq("store_id", storeId).maybeSingle(),
      supabase.from("renewal_automation_config").select("*").eq("store_id", storeId).maybeSingle(),
      supabase.from("renewal_email_templates").select("*").eq("store_id", storeId),
      supabase.from("renewal_reminders").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(200),
      supabase.from("subscriptions").select("id, customer_id, product_name, end_date, status, customers(id, name, email, phone)").eq("store_id", storeId).eq("status", "active"),
    ]);

    if (emailRes.data) {
      setEmailConfig(emailRes.data as any);
      setEmailForm({
        provider_type: emailRes.data.provider_type || "smtp",
        smtp_host: emailRes.data.smtp_host || "",
        smtp_port: emailRes.data.smtp_port || 587,
        smtp_user: emailRes.data.smtp_user || "",
        smtp_pass: emailRes.data.smtp_pass || "",
        api_key: emailRes.data.api_key || "",
        sender_email: emailRes.data.sender_email || "",
        sender_name: emailRes.data.sender_name || "",
        rate_limit_per_minute: emailRes.data.rate_limit_per_minute || 30,
      });
    }

    if (autoRes.data) {
      setAutoConfig(autoRes.data as any);
    }

    if (tplRes.data) setTemplates(tplRes.data as any);
    if (remRes.data) setReminders(remRes.data as any);
    if (subRes.data) setSubscriptions(subRes.data as Subscription[]);
  }, [user, activeStore]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Renewal Detection ───────────────────────────────
  const renewalStats = useMemo(() => {
    const now = new Date();
    const upcoming: Subscription[] = [];
    const expiringSoon: Subscription[] = [];
    const expired: Subscription[] = [];

    for (const sub of subscriptions) {
      if (!sub.end_date) continue;
      const days = differenceInDays(new Date(sub.end_date), now);
      if (days < 0) expired.push(sub);
      else if (days <= 2) expiringSoon.push(sub);
      else if (days <= 30) upcoming.push(sub);
    }

    return { upcoming, expiringSoon, expired };
  }, [subscriptions]);

  const reminderStats = useMemo(() => {
    const sent = reminders.filter((r) => r.status === "sent" || r.status === "delivered").length;
    const failed = reminders.filter((r) => r.status === "failed").length;
    const pending = reminders.filter((r) => r.status === "pending" || r.status === "sending").length;
    return { sent, failed, pending, total: reminders.length };
  }, [reminders]);

  // ─── Email Config Actions ───────────────────────────
  const saveEmailConfig = async () => {
    if (!user || !activeStore) return;
    const payload = {
      ...emailForm,
      store_id: activeStore.id,
      user_id: effectiveUserId!,
    };

    if (emailConfig?.id) {
      const { error } = await supabase.from("email_store_config").update(payload).eq("id", emailConfig.id);
      if (error) toast.error(error.message);
      else toast.success("Email config saved");
    } else {
      const { error } = await supabase.from("email_store_config").insert(payload);
      if (error) toast.error(error.message);
      else toast.success("Email config created");
    }
    fetchAll();
  };

  const handleTestEmail = async () => {
    if (!activeStore || !testEmail) { toast.error("Enter test email"); return; }
    setTestingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-store-email", {
        body: { store_id: activeStore.id, test_email: testEmail },
      });
      if (error) throw error;
      if (data?.success) toast.success("✅ Test email sent successfully!");
      else toast.error(`❌ Test failed: ${data?.error || "Unknown error"}`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setTestingEmail(false);
    fetchAll();
  };

  // ─── Automation Config ──────────────────────────────
  const toggleAutoMode = async () => {
    if (!user || !activeStore) return;
    const newMode = !autoConfig?.is_auto_mode;

    if (autoConfig?.id) {
      await supabase.from("renewal_automation_config").update({ is_auto_mode: newMode, is_active: newMode }).eq("id", autoConfig.id);
    } else {
      await supabase.from("renewal_automation_config").insert({
        store_id: activeStore.id,
        user_id: effectiveUserId!,
        is_auto_mode: newMode,
        is_active: newMode,
      });
    }
    toast.success(newMode ? "Auto mode enabled" : "Auto mode disabled");
    fetchAll();
  };

  const saveScheduleTime = async (time: string) => {
    if (!user || !activeStore) return;
    if (autoConfig?.id) {
      await supabase.from("renewal_automation_config").update({ schedule_time: time }).eq("id", autoConfig.id);
    } else {
      await supabase.from("renewal_automation_config").insert({
        store_id: activeStore.id,
        user_id: effectiveUserId!,
        schedule_time: time,
      });
    }
    fetchAll();
  };

  // ─── Templates ──────────────────────────────────────
  const saveTemplate = async () => {
    if (!user || !activeStore || !editingTemplate) return;
    const payload = {
      store_id: activeStore.id,
      user_id: effectiveUserId!,
      template_type: editingTemplate.template_type,
      subject: editingTemplate.subject,
      body: editingTemplate.body,
      is_active: editingTemplate.is_active,
    };

    if (editingTemplate.id) {
      const { error } = await supabase.from("renewal_email_templates").update(payload).eq("id", editingTemplate.id);
      if (error) toast.error(error.message);
      else toast.success("Template saved");
    } else {
      const { error } = await supabase.from("renewal_email_templates").insert(payload);
      if (error) toast.error(error.message);
      else toast.success("Template created");
    }
    setTemplateDialogOpen(false);
    fetchAll();
  };

  const openTemplateEditor = (type: string) => {
    const existing = templates.find((t) => t.template_type === type);
    if (existing) {
      setEditingTemplate(existing);
    } else {
      const def = DEFAULT_TEMPLATES[type];
      setEditingTemplate({
        store_id: activeStore?.id || "",
        user_id: user?.id || "",
        template_type: type,
        subject: def?.subject || "",
        body: def?.body || "",
        is_active: true,
      });
    }
    setTemplateDialogOpen(true);
  };

  // ─── Selected Template Helper ─────────────────────
  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId) return null;
    return templates.find((t) => t.id === selectedTemplateId) || null;
  }, [selectedTemplateId, templates]);

  const previewBody = useMemo(() => {
    if (!selectedTemplate) return "";
    return selectedTemplate.body
      .replace(/\{\{customer_name\}\}/g, "John Doe")
      .replace(/\{\{product_name\}\}/g, "Sample Product")
      .replace(/\{\{expiry_date\}\}/g, "2026-05-01")
      .replace(/\{\{store_name\}\}/g, activeStore?.name || "My Store")
      .replace(/\[CTA:\{[^}]*"text"\s*:\s*"([^"]*)"[^}]*"url"\s*:\s*"([^"]*)"[^}]*"color"\s*:\s*"([^"]*)"[^}]*\}\]/g, '<a href="$2" style="display:inline-block;padding:10px 24px;background:$3;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;margin-top:12px;">$1</a>')
      .replace(/\[CTA:(.*?)\|(.*?)\|(.*?)\]/g, '<a href="$2" style="display:inline-block;padding:10px 24px;background:$3;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">$1</a>');
  }, [selectedTemplate, activeStore]);

  // ─── Campaign Test Send ────────────────────────────
  const handleCampaignTestSend = async () => {
    if (!activeStore || !campaignTestEmail || !selectedTemplate) return;
    setCampaignTestSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-store-email", {
        body: {
          store_id: activeStore.id,
          test_email: campaignTestEmail,
          subject: selectedTemplate.subject.replace(/\{\{product_name\}\}/g, "Test Product"),
          body: selectedTemplate.body
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
    setCampaignTestSending(false);
  };

  // ─── Run Campaign / Automation ──────────────────────
  const runAutomation = async (mode: "auto" | "campaign") => {
    if (!user || !activeStore) return;
    setCampaignRunning(true);
    setCampaignProgress({ sent: 0, failed: 0, total: 0 });

    try {
      const { data, error } = await supabase.functions.invoke("send-renewal-reminders", {
        body: {
          store_id: activeStore.id,
          user_id: effectiveUserId!,
          mode,
          customer_ids: mode === "campaign" ? selectedCustomers : undefined,
          template_id: selectedTemplateId || undefined,
        },
      });

      if (error) throw error;

      setCampaignProgress({ sent: data.sent || 0, failed: data.failed || 0, total: data.total || 0 });

      if (data.sent > 0) {
        toast.success(`✅ ${data.sent} email(s) sent successfully!`);
      } else if (data.message) {
        toast.info(data.message);
      }
      if (data.failed > 0) {
        toast.error(`${data.failed} email(s) failed`);
      }
    } catch (e: any) {
      toast.error(e.message);
    }

    setCampaignRunning(false);
    fetchAll();
  };

  // Toggle customer selection for campaign
  const toggleCustomerSelection = (customerId: string) => {
    setSelectedCustomers((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]
    );
  };

  const selectAllCustomers = () => {
    const allIds = [...renewalStats.expiringSoon, ...renewalStats.expired, ...renewalStats.upcoming]
      .map((s) => s.customer_id)
      .filter(Boolean) as string[];
    setSelectedCustomers([...new Set(allIds)]);
  };

  // ─── WhatsApp Helper ──────────────────────────────
  const openWhatsApp = (phone: string | null, customerName: string, productName: string, expiryDate: string | null) => {
    if (!phone) {
      toast.error("No phone number for this customer");
      return;
    }
    // Clean phone number - remove spaces, dashes, etc.
    let cleanPhone = phone.replace(/[\s\-()]/g, "");
    // Add country code if not present
    if (!cleanPhone.startsWith("+") && !cleanPhone.startsWith("00")) {
      cleanPhone = "+880" + cleanPhone; // Default Bangladesh country code
    }
    cleanPhone = cleanPhone.replace(/^\+/, "");

    const message = encodeURIComponent(
      `Hi ${customerName},\n\nYour subscription for "${productName}" ${expiryDate ? `expires on ${expiryDate}` : "needs renewal"}.\n\nPlease renew to continue enjoying our services.\n\nThank you!`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank");
  };

  const sendWhatsAppBulk = () => {
    const allSubs = [...renewalStats.expired, ...renewalStats.expiringSoon, ...renewalStats.upcoming];
    const selected = allSubs.filter((s) => selectedCustomers.includes((s.customers as any)?.id || ""));

    if (selected.length === 0) {
      toast.error("Select customers first");
      return;
    }

    // Open WhatsApp for each selected customer sequentially
    let opened = 0;
    for (const s of selected) {
      const customer = s.customers as any;
      if (customer?.phone) {
        setTimeout(() => {
          openWhatsApp(customer.phone, customer.name, s.product_name, s.end_date);
        }, opened * 1500); // Stagger opens
        opened++;
      }
    }

    if (opened === 0) {
      toast.error("No selected customers have phone numbers");
    } else {
      toast.success(`Opening WhatsApp for ${opened} customer(s)...`);
    }
  };

  // ─── Render Helpers ─────────────────────────────────
  const statusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
      sent: { variant: "default", icon: CheckCircle2 },
      delivered: { variant: "default", icon: MailCheck },
      failed: { variant: "destructive", icon: XCircle },
      pending: { variant: "secondary", icon: Clock },
      sending: { variant: "outline", icon: Send },
    };
    const v = variants[status] || variants.pending;
    const Icon = v.icon;
    return (
      <Badge variant={v.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const isApiProvider = emailForm.provider_type === "sendgrid" || emailForm.provider_type === "resend";
  const deliverability = reminderStats.total > 0 ? Math.round((reminderStats.sent / reminderStats.total) * 100) : 0;
  const totalUpcoming = renewalStats.upcoming.length + renewalStats.expiringSoon.length + renewalStats.expired.length;
  const isAutoActive = !!autoConfig?.is_auto_mode;
  const isEmailConfigured = !!emailConfig?.id && !!emailConfig?.sender_email;

  return (
    <DashboardLayout>
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-indigo-500/5 p-6 shadow-card mb-6">
        <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-400/20 to-violet-500/20 blur-3xl" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Bot className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Bot Automation</h1>
                <Badge variant="outline" className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 text-[10px]">
                  <Zap className="h-2.5 w-2.5 mr-1" /> AI ENGINE
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Renewal reminders, email campaigns & automation engine
              </p>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 ${isEmailConfigured ? "text-success" : "text-warning"}`}>
                  {isEmailConfigured ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {isEmailConfigured ? "Email configured" : "Email not configured"}
                </span>
                <span>•</span>
                <span>Daily at {autoConfig?.schedule_time || "09:00"}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border transition-colors ${
              isAutoActive ? "bg-success/5 border-success/30" : "bg-muted/30 border-border"
            }`}>
              <span className="text-xs font-medium">Auto Mode</span>
              <Switch checked={isAutoActive} onCheckedChange={toggleAutoMode} />
              <Badge variant="outline" className={`text-[10px] ${
                isAutoActive ? "bg-success/10 text-success border-success/30" : "bg-muted text-muted-foreground"
              }`}>
                {isAutoActive ? "ACTIVE" : "OFF"}
              </Badge>
            </div>
            <Button
              onClick={() => runAutomation("auto")}
              disabled={campaignRunning}
              className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 shadow-md shadow-indigo-500/20 text-white"
            >
              {campaignRunning ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Run Now
            </Button>
          </div>
        </div>
      </div>

      {/* Setup hint when email not configured */}
      {!isEmailConfigured && activeTab === "dashboard" && (
        <div className="rounded-xl border border-warning/30 bg-gradient-to-r from-warning/5 to-amber-500/5 p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-warning/15 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-warning" />
            </div>
            <div>
              <div className="text-sm font-semibold">Email provider not configured</div>
              <div className="text-xs text-muted-foreground">Set up SMTP or an API provider to start sending automated reminders.</div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setActiveTab("email-config")}>
            <Settings className="h-3.5 w-3.5 mr-2" /> Configure Email
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="email-config">Email Config</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="branding" className="gap-1.5"><Palette className="h-3.5 w-3.5" />Branding</TabsTrigger>
          <TabsTrigger value="campaign">Campaign</TabsTrigger>
          <TabsTrigger value="marketing" className="gap-1.5"><Megaphone className="h-3.5 w-3.5" />Marketing</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
        </TabsList>

        {/* ─── DASHBOARD TAB ──────────────────────────── */}
        <TabsContent value="dashboard">
          {/* Premium KPI Cards */}
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            {/* Automation Status */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-indigo-600" />
                </div>
                <Badge variant="outline" className={`text-[10px] ${
                  isAutoActive
                    ? "bg-success/10 text-success border-success/30"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {isAutoActive ? "LIVE" : "PAUSED"}
                </Badge>
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Automation</div>
              <div className="text-2xl font-bold mt-1">{isAutoActive ? "Active" : "Manual"}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Daily at {autoConfig?.schedule_time || "09:00"}
              </div>
            </div>

            {/* Delivery */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15 flex items-center justify-center">
                  <MailCheck className="h-5 w-5 text-emerald-600" />
                </div>
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">
                  {deliverability}%
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Delivered (30d)</div>
              <div className="text-2xl font-bold mt-1">{reminderStats.sent}</div>
              <div className="mt-2">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                    style={{ width: `${deliverability}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Pending */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/15 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Queue</div>
              <div className="text-2xl font-bold mt-1">{reminderStats.pending}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {reminderStats.failed > 0 ? (
                  <span className="text-destructive">{reminderStats.failed} failed</span>
                ) : "All clean"}
              </div>
            </div>

            {/* Upcoming Renewals */}
            <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-indigo-500/5 p-5 shadow-card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500/15 to-purple-500/15 flex items-center justify-center">
                  <Users className="h-5 w-5 text-indigo-600" />
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Renewals (30d)</div>
              <div className="text-2xl font-bold mt-1">{totalUpcoming}</div>
              <div className="text-xs text-muted-foreground mt-1">Across all stages</div>
            </div>
          </div>

          {/* Renewal Pipeline */}
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            {[
              {
                title: "Expired",
                count: renewalStats.expired.length,
                items: renewalStats.expired,
                gradient: "from-destructive/10 to-red-500/5",
                accent: "from-destructive to-red-600",
                textColor: "text-destructive",
                borderColor: "border-destructive/20",
                icon: XCircle,
              },
              {
                title: "Critical (≤2 days)",
                count: renewalStats.expiringSoon.length,
                items: renewalStats.expiringSoon,
                gradient: "from-warning/10 to-amber-500/5",
                accent: "from-warning to-orange-500",
                textColor: "text-warning",
                borderColor: "border-warning/20",
                icon: AlertTriangle,
              },
              {
                title: "Upcoming (≤30 days)",
                count: renewalStats.upcoming.length,
                items: renewalStats.upcoming,
                gradient: "from-primary/10 to-indigo-500/5",
                accent: "from-primary to-indigo-500",
                textColor: "text-primary",
                borderColor: "border-primary/20",
                icon: Clock,
              },
            ].map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className={`relative overflow-hidden rounded-2xl border ${p.borderColor} bg-gradient-to-br ${p.gradient} p-5 shadow-card`}
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${p.accent}`} />
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-background/60 flex items-center justify-center">
                        <Icon className={`h-4 w-4 ${p.textColor}`} />
                      </div>
                      <div className="text-sm font-semibold">{p.title}</div>
                    </div>
                    <div className={`text-2xl font-bold ${p.textColor}`}>{p.count}</div>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {p.items.length === 0 ? (
                      <div className="text-xs text-muted-foreground text-center py-3">No items</div>
                    ) : p.items.slice(0, 5).map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 text-xs bg-background/60 rounded-lg px-2.5 py-1.5">
                        <span className="font-medium truncate">{(s.customers as any)?.name || "—"}</span>
                        <span className="text-muted-foreground truncate text-[10px]">{s.product_name}</span>
                      </div>
                    ))}
                  </div>
                  {p.items.length > 5 && (
                    <div className="text-[10px] text-muted-foreground mt-2 text-center">
                      +{p.items.length - 5} more
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Start Guide */}
          <div className="rounded-2xl border border-indigo-500/15 bg-gradient-to-br from-indigo-500/5 via-card to-violet-500/5 p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold">Quick Start Guide</div>
                <div className="text-xs text-muted-foreground">Get your automation running in 4 steps</div>
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-3">
              {[
                { n: 1, title: "Configure Email", desc: "Connect SMTP or API provider (SendGrid, Resend).", action: "Go to Email Config", tab: "email-config", icon: Settings },
                { n: 2, title: "Customize Templates", desc: "Edit reminder templates with merge tags & CTAs.", action: "Edit Templates", tab: "templates", icon: FileText },
                { n: 3, title: "Set Branding", desc: "Add logo, colors, and footer for branded emails.", action: "Open Branding", tab: "branding", icon: Palette },
                { n: 4, title: "Enable Auto Mode", desc: "Toggle Auto Mode in the header — done!", action: null, tab: null, icon: Play },
              ].map((g) => {
                const Icon = g.icon;
                return (
                  <div key={g.n} className="rounded-xl bg-background/60 border border-border/50 p-3 flex flex-col">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                        {g.n}
                      </div>
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-semibold">{g.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex-1">{g.desc}</div>
                    {g.action && g.tab && (
                      <button
                        type="button"
                        onClick={() => setActiveTab(g.tab!)}
                        className="text-[11px] text-primary hover:underline mt-2 text-left font-medium"
                      >
                        {g.action} →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reminder Tracking Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Reminder Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={trackingTab} onValueChange={setTrackingTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="delivered">Recently Delivered</TabsTrigger>
                  <TabsTrigger value="upcoming">
                    Upcoming Renewals ({renewalStats.upcoming.length + renewalStats.expiringSoon.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="delivered">
                  {reminders.filter((r) => r.status === "sent" || r.status === "delivered").length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No reminders sent yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Sent At</TableHead>
                          <TableHead>Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reminders
                          .filter((r) => r.status === "sent" || r.status === "delivered")
                          .slice(0, 50)
                          .map((r) => (
                            <TableRow key={r.id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">{r.recipient_name || "—"}</p>
                                  <p className="text-xs text-muted-foreground">{r.recipient_email}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{r.product_name || "—"}</TableCell>
                              <TableCell>{statusBadge(r.status)}</TableCell>
                              <TableCell className="text-sm">
                                {r.sent_at ? format(new Date(r.sent_at), "dd MMM yyyy HH:mm") : "—"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{r.reminder_type}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="upcoming">
                  {renewalStats.upcoming.length + renewalStats.expiringSoon.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No upcoming renewals.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Expiry Date</TableHead>
                          <TableHead>Days Left</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...renewalStats.expiringSoon, ...renewalStats.upcoming].map((s) => {
                          const days = differenceInDays(new Date(s.end_date!), new Date());
                          return (
                            <TableRow key={s.id}>
                              <TableCell>
                                <p className="font-medium text-sm">{(s.customers as any)?.name || "—"}</p>
                                <p className="text-xs text-muted-foreground">{(s.customers as any)?.email || ""}</p>
                              </TableCell>
                              <TableCell className="text-sm">{s.product_name}</TableCell>
                              <TableCell className="text-sm">{s.end_date}</TableCell>
                              <TableCell>
                                <Badge variant={days <= 2 ? "destructive" : days <= 7 ? "secondary" : "outline"}>
                                  {days} days
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {days <= 0 ? "Expired" : days <= 2 ? "Critical" : "Upcoming"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── EMAIL CONFIG TAB ───────────────────────── */}
        <TabsContent value="email-config">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" /> Email Provider
                </CardTitle>
                <CardDescription>Configure your email sending provider for this store</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Provider</Label>
                  <Select
                    value={emailForm.provider_type}
                    onValueChange={(v) => {
                      const def = providerDefaults[v];
                      setEmailForm({
                        ...emailForm,
                        provider_type: v,
                        smtp_host: def.host,
                        smtp_port: def.port,
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(providerLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!isApiProvider && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>SMTP Host</Label>
                        <Input value={emailForm.smtp_host} onChange={(e) => setEmailForm({ ...emailForm, smtp_host: e.target.value })} placeholder="smtp.example.com" />
                      </div>
                      <div>
                        <Label>SMTP Port</Label>
                        <Input type="number" value={emailForm.smtp_port} onChange={(e) => setEmailForm({ ...emailForm, smtp_port: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div>
                      <Label>SMTP Username</Label>
                      <Input value={emailForm.smtp_user} onChange={(e) => setEmailForm({ ...emailForm, smtp_user: e.target.value })} />
                    </div>
                    <div>
                      <Label>SMTP Password</Label>
                      <Input type="password" value={emailForm.smtp_pass} onChange={(e) => setEmailForm({ ...emailForm, smtp_pass: e.target.value })} />
                    </div>
                  </>
                )}

                {isApiProvider && (
                  <div>
                    <Label>API Key</Label>
                    <Input type="password" value={emailForm.api_key} onChange={(e) => setEmailForm({ ...emailForm, api_key: e.target.value })} placeholder="Enter API key" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Sender Email</Label>
                    <Input value={emailForm.sender_email} onChange={(e) => setEmailForm({ ...emailForm, sender_email: e.target.value })} placeholder="noreply@store.com" />
                  </div>
                  <div>
                    <Label>Sender Name</Label>
                    <Input value={emailForm.sender_name} onChange={(e) => setEmailForm({ ...emailForm, sender_name: e.target.value })} placeholder="My Store" />
                  </div>
                </div>

                <div>
                  <Label>Rate Limit (emails/min)</Label>
                  <Input type="number" value={emailForm.rate_limit_per_minute} onChange={(e) => setEmailForm({ ...emailForm, rate_limit_per_minute: Number(e.target.value) })} min={1} max={500} />
                  <p className="text-xs text-muted-foreground mt-1">Controls email queue speed to avoid being flagged</p>
                </div>

                <Button className="w-full" onClick={saveEmailConfig}>
                  <Shield className="h-4 w-4 mr-2" /> Save Email Config
                </Button>
              </CardContent>
            </Card>

            {/* Connection Status & Test */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {emailConfig?.connection_status === "connected" ? (
                      <Wifi className="h-5 w-5 text-green-500" />
                    ) : emailConfig?.connection_status === "failed" ? (
                      <WifiOff className="h-5 w-5 text-destructive" />
                    ) : (
                      <WifiOff className="h-5 w-5 text-muted-foreground" />
                    )}
                    Connection Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 mb-4">
                    <Badge
                      variant={emailConfig?.connection_status === "connected" ? "default" : "destructive"}
                      className={emailConfig?.connection_status === "connected" ? "bg-green-500" : ""}
                    >
                      {emailConfig?.connection_status === "connected" ? "Connected" :
                       emailConfig?.connection_status === "failed" ? "Failed" : "Not Connected"}
                    </Badge>
                    {emailConfig?.last_tested_at && (
                      <span className="text-xs text-muted-foreground">
                        Last tested: {format(new Date(emailConfig.last_tested_at), "dd MMM HH:mm")}
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label>Test Email Address</Label>
                      <Input
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="test@example.com"
                        type="email"
                      />
                    </div>
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={handleTestEmail}
                      disabled={testingEmail || !testEmail}
                    >
                      {testingEmail ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4 mr-2" />
                      )}
                      Send Test Email
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4" /> Schedule Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Daily Run Time</Label>
                    <Input
                      type="time"
                      value={autoConfig?.schedule_time || "09:00"}
                      onChange={(e) => saveScheduleTime(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      System checks for expiring subscriptions daily at this time
                    </p>
                  </div>
                  <div>
                    <Label>Reminder Days Before Expiry</Label>
                    <p className="text-sm text-muted-foreground">
                      {(autoConfig?.reminder_days || [7, 3, 1]).join(", ")} days before expiry
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ─── TEMPLATES TAB ──────────────────────────── */}
        <TabsContent value="templates">
          <EmailTemplateEditor
            templates={templates}
            storeId={activeStore?.id || ""}
            userId={user?.id || ""}
            senderEmail={emailConfig?.sender_email || ""}
            senderName={emailConfig?.sender_name || ""}
            onSave={fetchAll}
          />
        </TabsContent>

        {/* ─── BRANDING TAB ────────────────────────────── */}
        <TabsContent value="branding">
          <EmailBrandingTab />
        </TabsContent>

        {/* ─── MARKETING CAMPAIGN TAB ─────────────────── */}
        <TabsContent value="marketing">
          <MarketingCampaignTab />
        </TabsContent>

        {/* ─── CAMPAIGN TAB ───────────────────────────── */}
        <TabsContent value="campaign">
          {/* Template Selection & Settings */}
          <div className="grid gap-6 md:grid-cols-3 mb-6">
            {/* Template Selector */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" /> Select Email Template
                </CardTitle>
                <CardDescription>Choose a template created in Templates tab to use for this campaign</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose an email template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.filter(t => t.is_active).map((t) => (
                      <SelectItem key={t.id} value={t.id || ""}>
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <span>{templateLabels[t.template_type] || t.template_type}</span>
                          <span className="text-xs text-muted-foreground ml-2">— {t.subject.slice(0, 40)}{t.subject.length > 40 ? "..." : ""}</span>
                        </div>
                      </SelectItem>
                    ))}
                    {templates.filter(t => t.is_active).length === 0 && (
                      <SelectItem value="__none" disabled>
                        No active templates — create one in Templates tab
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>

                {selectedTemplate && (
                  <div className="flex gap-2">
                    <Dialog open={campaignPreviewOpen} onOpenChange={setCampaignPreviewOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-2" /> Preview Template
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Template Preview</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground mb-1">Subject:</p>
                            <p className="font-medium text-sm">
                              {selectedTemplate.subject
                                .replace(/\{\{customer_name\}\}/g, "John Doe")
                                .replace(/\{\{product_name\}\}/g, "Sample Product")
                                .replace(/\{\{expiry_date\}\}/g, "2026-05-01")}
                            </p>
                          </div>
                          <div className="border rounded-lg overflow-hidden">
                            <div className="bg-muted px-4 py-2 border-b">
                              <p className="text-xs text-muted-foreground flex items-center gap-2">
                                <Mail className="h-3 w-3" />
                                From: {emailConfig?.sender_name || "Store"} &lt;{emailConfig?.sender_email || "noreply@store.com"}&gt;
                              </p>
                            </div>
                            <div
                              className="p-6 bg-background text-foreground prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: previewBody.replace(/\n/g, "<br/>") }}
                            />
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setActiveTab("templates");
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-2" /> Edit Template
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Campaign Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Settings className="h-4 w-4" /> Campaign Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Test Send */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Test Send</Label>
                  <div className="flex gap-2">
                    <Input
                      value={campaignTestEmail}
                      onChange={(e) => setCampaignTestEmail(e.target.value)}
                      placeholder="test@email.com"
                      type="email"
                      className="text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCampaignTestSend}
                      disabled={campaignTestSending || !campaignTestEmail || !selectedTemplateId}
                    >
                      {campaignTestSending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}
                    </Button>
                  </div>
                  {!selectedTemplateId && (
                    <p className="text-xs text-muted-foreground">Select a template first</p>
                  )}
                </div>

                {/* Schedule */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schedule</Label>
                  <div className="flex items-center gap-2">
                    <Switch checked={isScheduled} onCheckedChange={setIsScheduled} />
                    <span className="text-sm">{isScheduled ? "Scheduled" : "Send Now"}</span>
                  </div>
                  {isScheduled && (
                    <Input
                      type="datetime-local"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="text-sm"
                      min={new Date().toISOString().slice(0, 16)}
                    />
                  )}
                </div>

                {/* Summary */}
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Summary</p>
                  <p className="text-sm">📧 Template: <span className="font-medium">{selectedTemplate ? (templateLabels[selectedTemplate.template_type] || selectedTemplate.template_type) : "None"}</span></p>
                  <p className="text-sm">👥 Recipients: <span className="font-medium">{selectedCustomers.length}</span></p>
                  <p className="text-sm">🕐 {isScheduled && scheduledTime ? `Scheduled: ${new Date(scheduledTime).toLocaleString()}` : "Send immediately"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Bar */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Campaign Recipients</CardTitle>
                  <CardDescription>Select customers to send renewal reminders</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllCustomers}>
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={sendWhatsAppBulk}
                    disabled={selectedCustomers.length === 0}
                    className="text-green-600 border-green-300 hover:bg-green-50"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    WhatsApp ({selectedCustomers.length})
                  </Button>
                  <Button
                    onClick={() => {
                      if (isScheduled && scheduledTime) {
                        toast.success(`Campaign scheduled for ${new Date(scheduledTime).toLocaleString()}`);
                      } else {
                        runAutomation("campaign");
                      }
                    }}
                    disabled={campaignRunning || selectedCustomers.length === 0 || !selectedTemplateId}
                  >
                    {campaignRunning ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : isScheduled ? (
                      <Clock className="h-4 w-4 mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    {isScheduled ? "Schedule" : "Start Campaign"} ({selectedCustomers.length})
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedTemplateId && (
                <div className="mb-4 p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">Select an email template above to start your campaign</p>
                </div>
              )}

              {campaignRunning && (
                <div className="mb-4 p-4 border rounded-lg">
                  <div className="flex justify-between text-sm mb-2">
                    <span>Sending progress...</span>
                    <span>{campaignProgress.sent + campaignProgress.failed} / {campaignProgress.total}</span>
                  </div>
                  <Progress
                    value={campaignProgress.total > 0 ? ((campaignProgress.sent + campaignProgress.failed) / campaignProgress.total) * 100 : 0}
                    className="h-2"
                  />
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className="text-green-500">✅ Sent: {campaignProgress.sent}</span>
                    <span className="text-destructive">❌ Failed: {campaignProgress.failed}</span>
                  </div>
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        onChange={(e) => e.target.checked ? selectAllCustomers() : setSelectedCustomers([])}
                        checked={selectedCustomers.length > 0}
                      />
                    </TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead>WhatsApp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...renewalStats.expired, ...renewalStats.expiringSoon, ...renewalStats.upcoming].map((s) => {
                    const customer = s.customers as any;
                    const days = differenceInDays(new Date(s.end_date!), new Date());
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedCustomers.includes(customer?.id || "")}
                            onChange={() => toggleCustomerSelection(customer?.id || "")}
                          />
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-sm">{customer?.name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{customer?.email || "No email"}</p>
                        </TableCell>
                        <TableCell className="text-sm">{s.product_name}</TableCell>
                        <TableCell className="text-sm">{s.end_date}</TableCell>
                        <TableCell>
                          <Badge variant={days <= 0 ? "destructive" : days <= 2 ? "secondary" : "outline"}>
                            {days <= 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50 p-1"
                            onClick={() => openWhatsApp(customer?.phone, customer?.name || "Customer", s.product_name, s.end_date)}
                            disabled={!customer?.phone}
                            title={customer?.phone ? `WhatsApp: ${customer.phone}` : "No phone number"}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {renewalStats.expired.length + renewalStats.expiringSoon.length + renewalStats.upcoming.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No subscriptions needing renewal found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TRACKING TAB ───────────────────────────── */}
        <TabsContent value="tracking">
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <p className="text-3xl font-bold">{reminderStats.total}</p>
                <p className="text-sm text-muted-foreground">Total Sent</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-3xl font-bold text-green-500">{reminderStats.sent}</p>
                <p className="text-sm text-muted-foreground">Delivered</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-3xl font-bold text-destructive">{reminderStats.failed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-3xl font-bold text-yellow-500">{reminderStats.pending}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Email Logs</CardTitle>
            </CardHeader>
            <CardContent>
              {reminders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No emails sent yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reminders.slice(0, 100).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-sm">{r.recipient_name || "—"}</TableCell>
                        <TableCell className="text-xs">{r.recipient_email || "—"}</TableCell>
                        <TableCell className="text-sm">{r.product_name || "—"}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{r.reminder_type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.sent_at ? format(new Date(r.sent_at), "dd MMM HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                          {r.error_message || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default BotAutomation;
