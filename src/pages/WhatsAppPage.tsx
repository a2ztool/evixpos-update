import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  MessageCircle, Send, Power, PowerOff, Save, Users, Copy, ExternalLink,
  ChevronDown, ChevronUp, CheckCircle2, BookOpen, Zap, FileText, Search,
  RefreshCw, Clock, BarChart3, AlertCircle, Phone, Globe, Lightbulb,
  TrendingUp, Sparkles, Activity, Shield, HelpCircle
} from "lucide-react";
import { format } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// ─── Message Templates ───
const MESSAGE_TEMPLATES = [
  { id: "welcome", label: "🎉 Welcome", text: "Hi {name}! Welcome to our store. We're glad to have you! Check out our latest products." },
  { id: "order_confirm", label: "📦 Order Confirmed", text: "Hi {name}, your order #{order_id} has been confirmed! We'll notify you once it ships." },
  { id: "payment_reminder", label: "💰 Payment Reminder", text: "Hi {name}, this is a friendly reminder about your pending payment of {amount}. Please pay at your earliest convenience." },
  { id: "shipping", label: "🚚 Shipping Update", text: "Hi {name}, your order #{order_id} has been shipped! Track it here: {tracking_url}" },
  { id: "offer", label: "🔥 Special Offer", text: "Hi {name}! 🎁 We have an exclusive offer just for you — {offer_details}. Hurry, limited time only!" },
  { id: "feedback", label: "⭐ Feedback Request", text: "Hi {name}, thank you for your recent purchase! We'd love to hear your feedback. How was your experience?" },
  { id: "restock", label: "📢 Back in Stock", text: "Hi {name}! Great news — {product_name} is back in stock! Grab yours before it sells out again." },
];

const WhatsAppPage = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { staffInfo, effectiveUserId: staffEffective } = useStaff();
  const effectiveUserId = staffEffective || user?.id;

  const [wa, setWa] = useState<any>(null);
  const [form, setForm] = useState({ api_key: "", phone_number: "" });
  const [sendOpen, setSendOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [sendForm, setSendForm] = useState({ phone: "", message: "" });
  const [bulkMessage, setBulkMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState("all");
  const [customerSearch, setCustomerSearch] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

  const fetchData = async () => {
    if (!effectiveUserId || !activeStore) return;
    const [{ data: integration }, { data: custs }, { data: logData }] = await Promise.all([
      supabase.from("integrations").select("*").eq("user_id", effectiveUserId).eq("store_id", activeStore.id).eq("type", "whatsapp").maybeSingle(),
      supabase.from("customers").select("id, name, phone, email").eq("user_id", effectiveUserId).eq("store_id", activeStore.id),
      supabase.from("notification_logs").select("*").eq("user_id", effectiveUserId).eq("channel", "whatsapp").order("created_at", { ascending: false }).limit(100),
    ]);
    if (integration) { setWa(integration); setForm({ api_key: integration.api_key ?? "", phone_number: integration.phone_number ?? "" }); }
    else { setWa(null); setForm({ api_key: "", phone_number: "" }); }
    if (custs) setCustomers(custs);
    if (logData) setLogs(logData);
  };

  useEffect(() => { fetchData(); }, [effectiveUserId, activeStore]);

  const save = async () => {
    if (!effectiveUserId || !form.api_key.trim() || !form.phone_number.trim()) {
      toast.error("Access Token ও Phone Number ID দুটোই দিতে হবে");
      return;
    }
    setSaving(true);
    try {
      if (wa) {
        await supabase.from("integrations").update({ api_key: form.api_key.trim(), phone_number: form.phone_number.trim(), status: "active" }).eq("id", wa.id);
        toast.success("WhatsApp credentials updated");
      } else {
        await supabase.from("integrations").insert({
          user_id: effectiveUserId, store_id: activeStore?.id,
          type: "whatsapp" as const, api_key: form.api_key.trim(),
          phone_number: form.phone_number.trim(), status: "active"
        });
        toast.success("WhatsApp connected successfully! 🎉");
      }
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
    setSaving(false);
  };

  const toggleStatus = async () => {
    if (!wa) return;
    const s = wa.status === "active" ? "inactive" : "active";
    await supabase.from("integrations").update({ status: s }).eq("id", wa.id);
    toast.success(`WhatsApp ${s === "active" ? "activated" : "deactivated"}`);
    fetchData();
  };

  const testConnection = async () => {
    if (!wa || wa.status !== "active") {
      toast.error("Please save and activate first");
      return;
    }
    setTesting(true);
    try {
      // Test by calling the graph API to check the phone number
      const res = await fetch(`https://graph.facebook.com/v19.0/${wa.phone_number}`, {
        headers: { Authorization: `Bearer ${wa.api_key}` },
      });
      const data = await res.json();
      if (res.ok && data.id) {
        toast.success(`✅ Connection verified! Phone: ${data.display_phone_number || data.id}`);
      } else {
        toast.error(`❌ Connection failed: ${data?.error?.message || "Invalid credentials"}`);
      }
    } catch {
      toast.error("❌ Connection test failed — check your credentials");
    }
    setTesting(false);
  };

  const sendSingle = async () => {
    if (!sendForm.phone || !sendForm.message) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("send-whatsapp", {
        body: { phone: sendForm.phone, message: sendForm.message, store_id: activeStore?.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      await supabase.from("notification_logs").insert({
        user_id: effectiveUserId!, channel: "whatsapp",
        recipient: sendForm.phone, message: sendForm.message, status: "sent",
      });
      toast.success("✅ Message sent!");
      setSendOpen(false);
      setSendForm({ phone: "", message: "" });
      fetchData();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send");
      // Log failure
      await supabase.from("notification_logs").insert({
        user_id: effectiveUserId!, channel: "whatsapp",
        recipient: sendForm.phone, message: sendForm.message, status: "failed",
      });
      fetchData();
    }
    setSending(false);
  };

  const sendBulk = async () => {
    if (!bulkMessage || selectedCustomers.length === 0) {
      toast.error("কাস্টমার সিলেক্ট করুন এবং মেসেজ লিখুন");
      return;
    }
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    let success = 0, fail = 0;

    for (const cid of selectedCustomers) {
      const c = customers.find((cu) => cu.id === cid);
      if (!c?.phone) { fail++; continue; }

      // Replace template variables
      const personalizedMsg = bulkMessage
        .replace(/\{name\}/g, c.name || "Customer")
        .replace(/\{phone\}/g, c.phone || "");

      try {
        const res = await supabase.functions.invoke("send-whatsapp", {
          body: { phone: c.phone, message: personalizedMsg, store_id: activeStore?.id },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.error || res.data?.error) { fail++; } else {
          success++;
          await supabase.from("notification_logs").insert({
            user_id: effectiveUserId!, channel: "whatsapp",
            recipient: c.phone, message: personalizedMsg, status: "sent",
          });
        }
      } catch { fail++; }
    }
    toast.success(`✅ Sent: ${success}, Failed: ${fail}`);
    setBulkOpen(false);
    setSelectedCustomers([]);
    setBulkMessage("");
    fetchData();
    setSending(false);
  };

  const toggleCustomer = (id: string) => {
    setSelectedCustomers((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  const selectAllCustomers = () => {
    const phoneCusts = customers.filter(c => c.phone);
    if (selectedCustomers.length === phoneCusts.length) {
      setSelectedCustomers([]);
    } else {
      setSelectedCustomers(phoneCusts.map(c => c.id));
    }
  };

  const useTemplate = (template: typeof MESSAGE_TEMPLATES[0], target: "single" | "bulk") => {
    if (target === "single") {
      setSendForm(prev => ({ ...prev, message: template.text }));
    } else {
      setBulkMessage(template.text);
    }
    toast.success(`"${template.label}" টেমপ্লেট ব্যবহার হচ্ছে`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied!");
  };

  // Stats
  const stats = useMemo(() => ({
    total: logs.length,
    sent: logs.filter(l => l.status === "sent").length,
    failed: logs.filter(l => l.status === "failed").length,
    contacts: customers.filter(c => c.phone).length,
    today: logs.filter(l => {
      const d = new Date(l.created_at);
      const t = new Date();
      return d.toDateString() === t.toDateString();
    }).length,
  }), [logs, customers]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (logFilter !== "all" && l.status !== logFilter) return false;
      if (logSearch && !l.recipient?.includes(logSearch) && !l.message?.toLowerCase().includes(logSearch.toLowerCase())) return false;
      return true;
    });
  }, [logs, logFilter, logSearch]);

  // Filtered customers for bulk
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => c.phone).filter(c => {
      if (!customerSearch) return true;
      return c.name?.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch);
    });
  }, [customers, customerSearch]);

  // ─── Setup Guide Steps ───
  const setupSteps = [
    {
      num: 1,
      title: "Meta Developer অ্যাকাউন্ট তৈরি করুন",
      content: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>👉 <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">developers.facebook.com</a> এ যান</p>
          <p>👉 আপনার Facebook অ্যাকাউন্ট দিয়ে লগইন করুন</p>
          <p>👉 Developer হিসেবে রেজিস্টার না থাকলে "Get Started" ক্লিক করুন</p>
          <p>👉 ফোন নম্বর ভেরিফাই করুন → Done!</p>
        </div>
      ),
    },
    {
      num: 2,
      title: "নতুন Business App তৈরি করুন",
      content: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>👉 <a href="https://developers.facebook.com/apps/create/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Create App</a> ক্লিক করুন</p>
          <p>👉 App Type: <strong>"Business"</strong> সিলেক্ট করুন</p>
          <p>👉 App Name দিন (যেমন: "My Store WhatsApp")</p>
          <p>👉 Business Account সিলেক্ট করুন (না থাকলে নতুন তৈরি করুন)</p>
          <p>👉 Create App ক্লিক করুন</p>
        </div>
      ),
    },
    {
      num: 3,
      title: "WhatsApp Product যোগ করুন",
      content: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>👉 App Dashboard-এ গিয়ে "Add Product" ক্লিক করুন</p>
          <p>👉 <strong>"WhatsApp"</strong> খুঁজে "Set Up" ক্লিক করুন</p>
          <p>👉 একটি Meta Business Account সিলেক্ট/তৈরি করুন</p>
          <p>👉 Setup সম্পন্ন হলে WhatsApp মেনু দেখা যাবে</p>
        </div>
      ),
    },
    {
      num: 4,
      title: "Access Token ও Phone Number ID সংগ্রহ করুন",
      content: (
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="font-medium text-foreground mb-1">📌 Temporary Access Token (টেস্টিং):</p>
            <p>👉 WhatsApp → API Setup → "Temporary access token" সেকশনে পাবেন</p>
            <p className="text-xs text-orange-500 mt-1">⚠️ এটি 24 ঘন্টা পর expire হয়। প্রোডাকশনে Permanent Token ব্যবহার করুন।</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="font-medium text-foreground mb-1">📌 Permanent Access Token (প্রোডাকশন):</p>
            <p>👉 Business Settings → System Users → নতুন System User তৈরি করুন</p>
            <p>👉 Role: Admin → Generate Token → "whatsapp_business_messaging" permission দিন</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="font-medium text-foreground mb-1">📌 Phone Number ID:</p>
            <p>👉 WhatsApp → API Setup → "Phone number ID" কপি করুন</p>
            <p>👉 এটি আপনার WhatsApp Business নম্বরের unique identifier</p>
          </div>
        </div>
      ),
    },
    {
      num: 5,
      title: "এখানে Credentials পেস্ট করুন",
      content: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>👉 উপরের "API Configuration" কার্ডে যান</p>
          <p>👉 <strong>Access Token</strong> ফিল্ডে আপনার token পেস্ট করুন</p>
          <p>👉 <strong>Phone Number ID</strong> ফিল্ডে আপনার phone number ID পেস্ট করুন</p>
          <p>👉 <strong>"Save & Connect"</strong> বাটনে ক্লিক করুন</p>
          <p>👉 তারপর <strong>"🔍 Test Connection"</strong> ক্লিক করে ভেরিফাই করুন</p>
          <p className="text-primary font-medium mt-2">✅ সব ঠিক থাকলে আপনি মেসেজ পাঠাতে পারবেন!</p>
        </div>
      ),
    },
    {
      num: 6,
      title: "টেস্ট মেসেজ পাঠান",
      content: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>👉 "Send Message" বাটনে ক্লিক করুন</p>
          <p>👉 আপনার নিজের নম্বর দিন (country code সহ, যেমন: +8801XXXXXXXXX)</p>
          <p>👉 একটি টেস্ট মেসেজ লিখুন</p>
          <p>👉 Send ক্লিক করুন</p>
          <div className="p-2 bg-orange-500/10 rounded mt-2">
            <p className="text-xs text-orange-600">⚠️ <strong>গুরুত্বপূর্ণ:</strong> টেস্ট মোডে শুধুমাত্র যে নম্বরগুলো আপনি Meta Developer Portal-এ "To" ফিল্ডে যোগ করেছেন, শুধু সেগুলোতেই মেসেজ যাবে।</p>
          </div>
        </div>
      ),
    },
  ];

  const [openSteps, setOpenSteps] = useState<number[]>([]);
  const toggleStep = (num: number) => {
    setOpenSteps(prev => prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]);
  };

  const successRate = stats.total > 0 ? ((stats.sent / stats.total) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-6">
        {/* ─── Premium Hero Header ─── */}
        <Card className="border-green-500/20 bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-card rounded-2xl overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex items-start gap-4 min-w-0 flex-1">
                <div className="h-14 w-14 rounded-2xl bg-green-500 shadow-lg shadow-green-500/30 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" className="h-8 w-8 fill-white">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">WhatsApp Business</h1>
                    {wa ? (
                      <Badge className={wa.status === "active"
                        ? "bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/20"
                        : "bg-muted text-muted-foreground border-border"}>
                        <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${wa.status === "active" ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
                        {wa.status === "active" ? "Connected" : "Inactive"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-orange-500/40 text-orange-600 bg-orange-500/10">Not Connected</Badge>
                    )}
                    <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 text-[10px]">
                      <Sparkles className="h-2.5 w-2.5 mr-1" /> Cloud API v19
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    Meta Cloud API দিয়ে কাস্টমারদের সাথে সরাসরি WhatsApp মেসেজিং করুন
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setGuideOpen(!guideOpen)} className="gap-1.5">
                  <BookOpen className="h-4 w-4" />Guide
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} disabled={!wa || wa.status !== "active"} className="gap-1.5">
                  <Users className="h-4 w-4" />Bulk
                </Button>
                <Button size="sm" onClick={() => setSendOpen(true)} disabled={!wa || wa.status !== "active"} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                  <Send className="h-4 w-4" />Send
                </Button>
              </div>
            </div>

            {/* Quick Stats Strip */}
            {wa && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-border/50">
                {[
                  { label: "Success Rate", value: `${successRate.toFixed(1)}%`, icon: TrendingUp, color: "text-emerald-500" },
                  { label: "Today", value: stats.today, icon: Clock, color: "text-blue-500" },
                  { label: "Total Sent", value: stats.total, icon: Send, color: "text-violet-500" },
                  { label: "Contacts", value: stats.contacts, icon: Users, color: "text-amber-500" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2.5">
                    <div className={`h-9 w-9 rounded-xl bg-card border border-border/50 flex items-center justify-center ${s.color}`}>
                      <s.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{s.label}</p>
                      <p className="text-base font-bold tabular-nums leading-tight truncate">{s.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Setup Guide (Collapsible) ─── */}
        {guideOpen && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-card rounded-2xl">
            <CardHeader className="pb-3 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">WhatsApp Business API সেটআপ গাইড</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">ধাপে ধাপে সেটআপ করুন — প্রতিটি ধাপ ক্লিক করে বিস্তারিত দেখুন</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setGuideOpen(false)}>Close</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 p-5 sm:p-6 pt-0">
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 mb-3">
                <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-foreground/80">
                  <strong>Tip:</strong> Meta Business অ্যাকাউন্ট আগে থেকে থাকলে দ্রুত সেটআপ হবে। Test mode-এ শুধু verified number-এ মেসেজ যাবে।
                </p>
              </div>
              {setupSteps.map((step) => (
                <Collapsible key={step.num} open={openSteps.includes(step.num)}>
                  <CollapsibleTrigger asChild>
                    <button
                      onClick={() => toggleStep(step.num)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left border border-border/40"
                    >
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                        {step.num}
                      </div>
                      <span className="font-medium flex-1 text-sm">{step.title}</span>
                      {openSteps.includes(step.num) ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-14 pr-4 pb-3 pt-2">
                    {step.content}
                  </CollapsibleContent>
                </Collapsible>
              ))}

              <div className="mt-4 p-3.5 rounded-xl bg-muted/40 border border-border/40">
                <p className="text-xs text-muted-foreground">
                  🔗 <strong>Meta Business Suite:</strong>{" "}
                  <a href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">business.facebook.com</a>
                  {" | "}
                  <strong>API Docs:</strong>{" "}
                  <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Cloud API Docs</a>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Tabs ─── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="w-full sm:w-auto inline-flex">
              <TabsTrigger value="dashboard" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Dashboard</span><span className="sm:hidden">Stats</span></TabsTrigger>
              <TabsTrigger value="config" className="gap-1.5"><Shield className="h-3.5 w-3.5" />Config</TabsTrigger>
              <TabsTrigger value="templates" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Templates</TabsTrigger>
              <TabsTrigger value="logs" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Logs</TabsTrigger>
            </TabsList>
          </div>

          {/* ─── Dashboard Tab ─── */}
          <TabsContent value="dashboard" className="space-y-5 mt-5">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Total Sent", value: stats.total, icon: Send, color: "text-blue-500", bg: "bg-blue-500/10" },
                { label: "Successful", value: stats.sent, icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
                { label: "Failed", value: stats.failed, icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10" },
                { label: "Today", value: stats.today, icon: Clock, color: "text-orange-500", bg: "bg-orange-500/10" },
                { label: "Contacts", value: stats.contacts, icon: Users, color: "text-purple-500", bg: "bg-purple-500/10" },
              ].map((s) => (
                <Card key={s.label} className="border-border/50 hover:shadow-md transition-all rounded-2xl h-full">
                  <CardContent className="!p-3.5 sm:!p-4 h-full flex items-center gap-3">
                    <div className={`h-9 w-9 shrink-0 rounded-xl ${s.bg} ${s.color} flex items-center justify-center`}>
                      <s.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{s.label}</p>
                      <p className="text-xl font-bold tabular-nums leading-tight mt-0.5">{s.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Quick Actions */}
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="p-5 sm:p-6 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Quick Actions</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">দ্রুত মেসেজ পাঠান বা কানেকশন টেস্ট করুন</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 pt-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Button variant="outline" className="h-auto py-4 flex-col gap-2 rounded-xl hover:border-green-500/40 hover:bg-green-500/5" onClick={() => setSendOpen(true)} disabled={!wa || wa.status !== "active"}>
                    <Send className="h-5 w-5 text-green-500" />
                    <span className="text-xs font-medium">Send Message</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-4 flex-col gap-2 rounded-xl hover:border-blue-500/40 hover:bg-blue-500/5" onClick={() => setBulkOpen(true)} disabled={!wa || wa.status !== "active"}>
                    <Users className="h-5 w-5 text-blue-500" />
                    <span className="text-xs font-medium">Bulk Send</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-4 flex-col gap-2 rounded-xl hover:border-yellow-500/40 hover:bg-yellow-500/5" onClick={testConnection} disabled={!wa || testing}>
                    <Zap className="h-5 w-5 text-yellow-500" />
                    <span className="text-xs font-medium">{testing ? "Testing..." : "Test Connection"}</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-4 flex-col gap-2 rounded-xl hover:border-primary/40 hover:bg-primary/5" onClick={fetchData}>
                    <RefreshCw className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs font-medium">Refresh Data</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Recent Messages Preview */}
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="flex-row items-center justify-between p-5 sm:p-6 pb-3 space-y-0">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
                    <MessageCircle className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Recent Messages</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">সর্বশেষ ৫টি WhatsApp মেসেজ</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab("logs")} className="text-xs">View All →</Button>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 pt-0">
                {logs.length === 0 ? (
                  <div className="text-center py-10">
                    <MessageCircle className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">কোনো মেসেজ পাঠানো হয়নি এখনও</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.slice(0, 5).map((l) => (
                      <div key={l.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:bg-muted/40 transition-colors">
                        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${l.status === "sent" ? "bg-green-500" : "bg-red-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium font-mono">{l.recipient}</p>
                          <p className="text-xs text-muted-foreground truncate">{l.message}</p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {format(new Date(l.created_at), "MMM dd, HH:mm")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Config Tab ─── */}
          <TabsContent value="config" className="space-y-5 mt-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="rounded-2xl border-border/50">
                <CardHeader className="p-5 sm:p-6 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
                        <Shield className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">API Configuration</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">Meta Cloud API credentials</p>
                      </div>
                    </div>
                    {wa && (
                      <Badge className={wa.status === "active"
                        ? "bg-green-500/15 text-green-600 border-green-500/30"
                        : "bg-muted text-muted-foreground"}>
                        {wa.status}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-5 sm:p-6 pt-0">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Access Token</Label>
                    <Input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="EAAx..." className="font-mono text-sm" />
                    <p className="text-xs text-muted-foreground">Meta Developer Portal → WhatsApp → API Setup</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone Number ID</Label>
                    <Input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} placeholder="123456789012345" className="font-mono text-sm" />
                    <p className="text-xs text-muted-foreground">WhatsApp Business Account-এর Phone Number ID</p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button onClick={save} className="flex-1 bg-green-600 hover:bg-green-700 text-white" disabled={saving}>
                      <Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : wa ? "Update" : "Save & Connect"}
                    </Button>
                    {wa && (
                      <>
                        <Button variant="outline" onClick={toggleStatus} title={wa.status === "active" ? "Deactivate" : "Activate"}>
                          {wa.status === "active" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>
                        <Button variant="outline" onClick={testConnection} disabled={testing} title="Test Connection">
                          <Zap className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-foreground/80">
                      Production-এ <strong>Permanent Token</strong> ব্যবহার করুন। Temporary token ২৪ ঘন্টা পর expire হয়।
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border/50">
                <CardHeader className="p-5 sm:p-6 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
                      <Activity className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Connection Status</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">লাইভ কানেকশন ও পারফরম্যান্স</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-5 sm:p-6 pt-0">
                  {[
                    { icon: Globe, label: "API Status", value: <Badge className={wa?.status === "active" ? "bg-green-500/15 text-green-600 border-green-500/30" : "bg-muted text-muted-foreground"}>{wa?.status === "active" ? "Active" : "Inactive"}</Badge> },
                    { icon: Phone, label: "Phone Number ID", value: <span className="text-sm font-mono">{wa?.phone_number ? `...${wa.phone_number.slice(-6)}` : "—"}</span> },
                    { icon: BarChart3, label: "Messages Sent", value: <span className="text-sm font-bold tabular-nums">{stats.total}</span> },
                    { icon: CheckCircle2, label: "Success Rate", value: <span className="text-sm font-bold tabular-nums text-green-600">{successRate > 0 ? `${successRate.toFixed(1)}%` : "—"}</span> },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border/40">
                      <div className="flex items-center gap-2.5">
                        <row.icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{row.label}</span>
                      </div>
                      {row.value}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── Templates Tab ─── */}
          <TabsContent value="templates" className="space-y-5 mt-5">
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="p-5 sm:p-6 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Message Templates</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      রেডিমেড টেমপ্লেট। <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{"{name}"}</code> অটো-রিপ্লেস হবে
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 pt-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  {MESSAGE_TEMPLATES.map((t) => (
                    <div key={t.id} className="p-4 border border-border/50 rounded-xl hover:border-primary/40 hover:shadow-sm transition-all bg-card flex flex-col gap-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">{t.label}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(t.text)} title="Copy">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{t.text}</p>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" className="text-xs h-7 flex-1" onClick={() => { useTemplate(t, "single"); setSendOpen(true); }}>
                          Single
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 flex-1" onClick={() => { useTemplate(t, "bulk"); setBulkOpen(true); }}>
                          Bulk
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Logs Tab ─── */}
          <TabsContent value="logs" className="space-y-5 mt-5">
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="p-5 sm:p-6 pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
                      <Activity className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Message Logs</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">সর্বশেষ ১০০টি WhatsApp মেসেজ</p>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input placeholder="Search..." value={logSearch} onChange={(e) => setLogSearch(e.target.value)} className="pl-8 h-9 sm:w-48 text-sm" />
                    </div>
                    <Select value={logFilter} onValueChange={setLogFilter}>
                      <SelectTrigger className="h-9 w-28 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 pt-0">
                {filteredLogs.length === 0 ? (
                  <div className="text-center py-10">
                    <Activity className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">কোনো মেসেজ পাওয়া যায়নি</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/50">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="text-xs uppercase tracking-wider">Date</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider">Recipient</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider">Message</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLogs.slice(0, 50).map((l) => (
                          <TableRow key={l.id} className="hover:bg-muted/30">
                            <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{format(new Date(l.created_at), "MMM dd, HH:mm")}</TableCell>
                            <TableCell className="text-sm font-mono">{l.recipient}</TableCell>
                            <TableCell className="text-sm text-muted-foreground truncate max-w-[300px]">{l.message}</TableCell>
                            <TableCell>
                              <Badge className={l.status === "sent"
                                ? "bg-green-500/15 text-green-600 border-green-500/30 text-xs"
                                : "bg-red-500/15 text-red-600 border-red-500/30 text-xs"}>
                                {l.status === "sent" ? "✓ Sent" : "✕ Failed"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ─── Single Send Dialog ─── */}
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-green-500" />
                Send WhatsApp Message
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Recipient Phone (country code সহ)</Label>
                <Input value={sendForm.phone} onChange={(e) => setSendForm({ ...sendForm, phone: e.target.value })} placeholder="+8801XXXXXXXXX" />
              </div>

              {/* Quick template selector */}
              <div className="space-y-2">
                <Label>Quick Template</Label>
                <Select onValueChange={(v) => {
                  const t = MESSAGE_TEMPLATES.find(t => t.id === v);
                  if (t) setSendForm(prev => ({ ...prev, message: t.text }));
                }}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="টেমপ্লেট সিলেক্ট করুন..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MESSAGE_TEMPLATES.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea value={sendForm.message} onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })} rows={4} placeholder="আপনার মেসেজ লিখুন..." />
                <p className="text-xs text-muted-foreground">{sendForm.message.length}/1600 characters</p>
              </div>
              <Button className="w-full" onClick={sendSingle} disabled={sending || !sendForm.phone || !sendForm.message}>
                {sending ? "Sending..." : "📤 Send Message"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Bulk Send Dialog ─── */}
        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Bulk WhatsApp Message
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Customer selection with search */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Customers ({selectedCustomers.length} selected)</Label>
                  <Button variant="ghost" size="sm" className="text-xs h-6" onClick={selectAllCustomers}>
                    {selectedCustomers.length === filteredCustomers.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search customers..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="pl-8 text-sm" />
                </div>
                <div className="max-h-48 overflow-y-auto border rounded-lg">
                  {filteredCustomers.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 p-2.5 hover:bg-muted/50 cursor-pointer border-b last:border-b-0">
                      <Checkbox checked={selectedCustomers.includes(c.id)} onCheckedChange={() => toggleCustomer(c.id)} />
                      <span className="text-sm flex-1">{c.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{c.phone}</span>
                    </label>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-4">কোনো কাস্টমার পাওয়া যায়নি।</p>
                  )}
                </div>
              </div>

              {/* Template selector for bulk */}
              <div className="space-y-2">
                <Label>Quick Template</Label>
                <Select onValueChange={(v) => {
                  const t = MESSAGE_TEMPLATES.find(t => t.id === v);
                  if (t) setBulkMessage(t.text);
                }}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="টেমপ্লেট সিলেক্ট করুন..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MESSAGE_TEMPLATES.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea value={bulkMessage} onChange={(e) => setBulkMessage(e.target.value)} rows={4} placeholder="Hello {name}! We have an exciting offer..." />
                <p className="text-xs text-muted-foreground">
                  <code>{"{name}"}</code> কাস্টমারের নাম দিয়ে অটো রিপ্লেস হবে। {bulkMessage.length}/1600 chars
                </p>
              </div>
              <Button className="w-full" onClick={sendBulk} disabled={sending || selectedCustomers.length === 0 || !bulkMessage}>
                {sending ? "Sending..." : `📤 Send to ${selectedCustomers.length} customers`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default WhatsAppPage;
