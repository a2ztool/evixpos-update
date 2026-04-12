import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  Ticket, Plus, Search, Filter, Clock, CheckCircle2, AlertCircle, XCircle,
  ChevronDown, ChevronUp, MessageCircle, Send, Paperclip, Star,
  HelpCircle, BookOpen, Headphones, Mail, Phone, Globe, Monitor,
  ShoppingCart, Palette, Video, Layout, Zap, ArrowUpRight,
  LayoutDashboard, Package, Users, CreditCard, RefreshCw, Plug, Gift,
  Settings, Bot, Bell, BarChart3, Megaphone, ListTodo, TrendingUp,
  ExternalLink, FileText, Shield, Loader2, Eye, Trash2
} from "lucide-react";

type Lang = "en" | "bn" | "hi";
const LANG_LABELS: Record<Lang, string> = { en: "English", bn: "বাংলা", hi: "हिंदी" };

interface SupportTicket {
  id: string;
  user_id: string;
  store_id: string | null;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
}

interface SupportMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  sender_type: string;
  attachment_url: string | null;
  created_at: string;
}

// Services
const SERVICES = [
  { icon: Globe, title: { en: "Web Development", bn: "ওয়েব ডেভেলপমেন্ট", hi: "वेब डेवलपमेंट" }, desc: { en: "Custom websites, web apps & SaaS", bn: "কাস্টম ওয়েবসাইট, ওয়েব অ্যাপ ও SaaS", hi: "कस्टम वेबसाइट, वेब ऐप्स और SaaS" }, color: "text-blue-500", bg: "bg-blue-500/10" },
  { icon: Monitor, title: { en: "eCommerce Solution", bn: "ইকমার্স সমাধান", hi: "ईकॉमर्स समाधान" }, desc: { en: "WooCommerce, Shopify & custom stores", bn: "WooCommerce, Shopify ও কাস্টম স্টোর", hi: "WooCommerce, Shopify और कस्टम स्टोर" }, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { icon: Palette, title: { en: "SEO & Marketing", bn: "এসইও ও মার্কেটিং", hi: "SEO और मार्केटिंग" }, desc: { en: "Search engine optimization & digital marketing", bn: "সার্চ ইঞ্জিন অপ্টিমাইজেশন ও ডিজিটাল মার্কেটিং", hi: "SEO और डिजिटल मार्केटिंग" }, color: "text-orange-500", bg: "bg-orange-500/10" },
  { icon: Video, title: { en: "Video Editing", bn: "ভিডিও এডিটিং", hi: "वीडियो एडिटिंग" }, desc: { en: "Professional video editing & motion graphics", bn: "পেশাদার ভিডিও এডিটিং ও মোশন গ্রাফিক্স", hi: "प्रोफेशनल वीडियो एडिटिंग" }, color: "text-purple-500", bg: "bg-purple-500/10" },
  { icon: Layout, title: { en: "Landing Page Design", bn: "ল্যান্ডিং পেজ ডিজাইন", hi: "लैंडिंग पेज डिज़ाइन" }, desc: { en: "High-converting landing pages", bn: "হাই-কনভার্টিং ল্যান্ডিং পেজ", hi: "हाई-कन्वर्टिंग लैंडिंग पेज" }, color: "text-pink-500", bg: "bg-pink-500/10" },
  { icon: Shield, title: { en: "Maintenance & Support", bn: "মেইনটেন্যান্স ও সাপোর্ট", hi: "रखरखाव और सहायता" }, desc: { en: "Ongoing website maintenance & support", bn: "চলমান ওয়েবসাইট রক্ষণাবেক্ষণ ও সাপোর্ট", hi: "वेबसाइट रखरखाव और सहायता" }, color: "text-cyan-500", bg: "bg-cyan-500/10" },
];

// Guides
interface GuideSection { id: string; icon: any; title: Record<Lang, string>; steps: Record<Lang, string[]>; }
const GUIDES: GuideSection[] = [
  { id: "dashboard", icon: LayoutDashboard, title: { en: "Dashboard", bn: "ড্যাশবোর্ড", hi: "डैशबोर्ड" }, steps: { en: ["Navigate to Dashboard from the sidebar.", "View key metrics: Revenue, Orders, Customers, Subscriptions.", "Revenue chart shows last 7 days trend.", "Recent Orders shows latest 5 orders."], bn: ["সাইডবার থেকে ড্যাশবোর্ডে যান।", "মেট্রিক্স দেখুন: আয়, অর্ডার, কাস্টমার, সাবস্ক্রিপশন।", "রেভেনিউ চার্ট গত ৭ দিনের ট্রেন্ড দেখায়।", "সাম্প্রতিক অর্ডার সর্বশেষ ৫টি দেখায়।"], hi: ["साइडबार से डैशबोर्ड पर जाएं।", "मेट्रिक्स देखें: राजस्व, ऑर्डर, ग्राहक, सब्सक्रिप्शन।", "रेवेन्यू चार्ट पिछले 7 दिनों का ट्रेंड दिखाता है।", "हालिया ऑर्डर नवीनतम 5 दिखाता है।"] } },
  { id: "pos", icon: Monitor, title: { en: "POS Terminal", bn: "POS টার্মিনাল", hi: "POS टर्मिनल" }, steps: { en: ["Go to POS from sidebar.", "Search/browse products from product grid.", "Click product to add to cart.", "Select customer, payment method, apply discount.", "Click 'Complete Sale' to finalize."], bn: ["সাইডবার থেকে POS-এ যান।", "প্রোডাক্ট গ্রিড থেকে পণ্য সার্চ করুন।", "কার্টে যোগ করতে পণ্যে ক্লিক করুন।", "কাস্টমার, পেমেন্ট মেথড নির্বাচন, ডিসকাউন্ট দিন।", "'Complete Sale' ক্লিক করুন।"], hi: ["साइडबार से POS पर जाएं।", "प्रोडक्ट ग्रिड से उत्पाद खोजें।", "कार्ट में जोड़ने के लिए क्लिक करें।", "ग्राहक, भुगतान विधि चुनें, छूट लागू करें।", "'Complete Sale' क्लिक करें।"] } },
  { id: "orders", icon: ShoppingCart, title: { en: "Orders", bn: "অর্ডার", hi: "ऑर्डर" }, steps: { en: ["Go to Orders > All Orders.", "Use 'Create Order' to add new order.", "Select products, quantities, customer.", "Filter by status and search by name."], bn: ["Orders > All Orders এ যান।", "'Create Order' দিয়ে নতুন অর্ডার তৈরি করুন।", "পণ্য, পরিমাণ, কাস্টমার নির্বাচন করুন।", "স্ট্যাটাস ফিল্টার ও নাম দিয়ে সার্চ করুন।"], hi: ["Orders > All Orders पर जाएं।", "'Create Order' से नया ऑर्डर बनाएं।", "उत्पाद, मात्रा, ग्राहक चुनें।", "स्थिति फ़िल्टर और नाम से खोजें।"] } },
  { id: "products", icon: Package, title: { en: "Products", bn: "পণ্য", hi: "उत्पाद" }, steps: { en: ["Navigate to Products from sidebar.", "Click 'Add Product' with name, price, SKU.", "Set type: Physical or Digital.", "Manage Order Forms and Coupons."], bn: ["সাইডবার থেকে Products এ যান।", "'Add Product' ক্লিক করুন।", "ধরন সেট করুন: Physical বা Digital।", "Order Forms ও Coupons ম্যানেজ করুন।"], hi: ["साइडबार से Products पर जाएं।", "'Add Product' क्लिक करें।", "प्रकार सेट करें: Physical या Digital।", "Order Forms और Coupons प्रबंधित करें।"] } },
  { id: "customers", icon: Users, title: { en: "Customers", bn: "কাস্টমার", hi: "ग्राहक" }, steps: { en: ["Go to Customers from sidebar.", "Add customers with name, phone, email.", "Search and filter customers.", "Customer links to orders automatically."], bn: ["সাইডবার থেকে Customers এ যান।", "নাম, ফোন, ইমেইল দিয়ে কাস্টমার যোগ করুন।", "কাস্টমার সার্চ ও ফিল্টার করুন।", "কাস্টমার অটোমেটিক অর্ডারে লিঙ্ক হয়।"], hi: ["साइडबार से Customers पर जाएं।", "नाम, फ़ोन, ईमेल से ग्राहक जोड़ें।", "ग्राहक खोजें और फ़िल्टर करें।", "ग्राहक स्वचालित रूप से ऑर्डर से जुड़ता है।"] } },
  { id: "finances", icon: CreditCard, title: { en: "Finances", bn: "ফাইন্যান্স", hi: "वित्त" }, steps: { en: ["Sales & Profit: Revenue vs cost charts.", "Income & Expense: Track all transactions.", "Due Book: Manage receivables/payables.", "Ad Costs: Track marketing ROI.", "Task & Mission: Manage operational tasks."], bn: ["Sales & Profit: আয় বনাম খরচ চার্ট।", "Income & Expense: সব লেনদেন ট্র্যাক করুন।", "Due Book: পাওনা/দেনা ম্যানেজ করুন।", "Ad Costs: মার্কেটিং ROI ট্র্যাক করুন।", "Task & Mission: অপারেশনাল টাস্ক ম্যানেজ করুন।"], hi: ["Sales & Profit: राजस्व बनाम लागत चार्ट।", "Income & Expense: सभी लेनदेन ट्रैक करें।", "Due Book: प्राप्य/देय प्रबंधित करें।", "Ad Costs: मार्केटिंग ROI ट्रैक करें।", "Task & Mission: परिचालन कार्य प्रबंधित करें।"] } },
  { id: "integrations", icon: Plug, title: { en: "Integrations", bn: "ইন্টিগ্রেশন", hi: "एकीकरण" }, steps: { en: ["Notifications: SMTP email settings.", "WooCommerce: Connect store with API.", "Bot Automation: Trigger-based automations.", "WhatsApp: Send messages to customers."], bn: ["Notifications: SMTP ইমেইল সেটিংস।", "WooCommerce: API দিয়ে স্টোর কানেক্ট।", "Bot Automation: ট্রিগার-ভিত্তিক অটোমেশন।", "WhatsApp: কাস্টমারদের মেসেজ পাঠান।"], hi: ["Notifications: SMTP ईमेल सेटिंग्स।", "WooCommerce: API से स्टोर कनेक्ट।", "Bot Automation: ट्रिगर-आधारित ऑटोमेशन।", "WhatsApp: ग्राहकों को संदेश भेजें।"] } },
];

// FAQ
const FAQS: Array<{ q: Record<Lang, string>; a: Record<Lang, string> }> = [
  { q: { en: "How do I upgrade my plan?", bn: "প্ল্যান কিভাবে আপগ্রেড করব?", hi: "प्लान कैसे अपग्रेड करूं?" }, a: { en: "Go to My Plan page, select plan and click 'Upgrade Now'.", bn: "My Plan পেজে যান, প্ল্যান নির্বাচন করে 'Upgrade Now' ক্লিক করুন।", hi: "My Plan पेज पर जाएं, प्लान चुनें और 'Upgrade Now' क्लिक करें।" } },
  { q: { en: "How does WhatsApp integration work?", bn: "WhatsApp ইন্টিগ্রেশন কিভাবে কাজ করে?", hi: "WhatsApp एकीकरण कैसे काम करता है?" }, a: { en: "Connect WhatsApp Business API from Integrations > WhatsApp. Send messages, broadcasts, and set up bot responses.", bn: "Integrations > WhatsApp থেকে WhatsApp Business API কানেক্ট করুন।", hi: "Integrations > WhatsApp से WhatsApp Business API कनेक्ट करें।" } },
  { q: { en: "Can I export my data?", bn: "ডেটা এক্সপোর্ট করতে পারি?", hi: "डेटा एक्सपोर्ट कर सकता हूं?" }, a: { en: "Yes! Export CSV from notifications, reports, and various pages.", bn: "হ্যাঁ! নোটিফিকেশন, রিপোর্ট থেকে CSV এক্সপোর্ট করুন।", hi: "हाँ! नोटिफिकेशन, रिपोर्ट से CSV एक्सपोर्ट करें।" } },
  { q: { en: "How do subscriptions work?", bn: "সাবস্ক্রিপশন কিভাবে কাজ করে?", hi: "सब्सक्रिप्शन कैसे काम करते हैं?" }, a: { en: "Create manually or auto from orders. Set duration 7d to 12mo. Auto WhatsApp reminders before expiry.", bn: "ম্যানুয়ালি বা অর্ডার থেকে তৈরি করুন। ৭ দিন-১২ মাস সময়কাল। মেয়াদ শেষ হওয়ার আগে অটো রিমাইন্ডার।", hi: "मैन्युअल या ऑर्डर से बनाएं। 7 दिन-12 महीने अवधि। समाप्ति से पहले ऑटो रिमाइंडर।" } },
  { q: { en: "How to connect multiple stores?", bn: "একাধিক স্টোর কিভাবে কানেক্ট করব?", hi: "कई स्टोर कैसे कनेक्ट करें?" }, a: { en: "Pro plan allows 3 stores, Business plan allows 10. Switch stores from the store switcher.", bn: "Pro প্ল্যানে ৩টি, Business প্ল্যানে ১০টি স্টোর। স্টোর সুইচার থেকে পরিবর্তন করুন।", hi: "Pro प्लान में 3, Business प्लान में 10 स्टोर। स्टोर स्विचर से बदलें।" } },
];

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Low", color: "text-muted-foreground", bg: "bg-muted" },
  medium: { label: "Medium", color: "text-blue-600", bg: "bg-blue-500/10" },
  high: { label: "High", color: "text-orange-600", bg: "bg-orange-500/10" },
  urgent: { label: "Urgent", color: "text-red-600", bg: "bg-red-500/10" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  open: { label: "Open", icon: AlertCircle, color: "text-blue-600", bg: "bg-blue-500/10" },
  in_progress: { label: "In Progress", icon: Clock, color: "text-orange-600", bg: "bg-orange-500/10" },
  resolved: { label: "Resolved", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  closed: { label: "Closed", icon: XCircle, color: "text-muted-foreground", bg: "bg-muted" },
};

const CATEGORY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical" },
  { value: "feature", label: "Feature Request" },
];

const SupportPage = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const [lang, setLang] = useState<Lang>("bn");
  const [activeTab, setActiveTab] = useState("tickets");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Ticket form
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<SupportTicket | null>(null);
  const [form, setForm] = useState({ subject: "", description: "", category: "general", priority: "medium" });

  // Ticket detail / messages
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);

  // Guide/FAQ
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [guideSearch, setGuideSearch] = useState("");

  const fetchTickets = async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase.from("support_tickets").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (activeStore) query = query.eq("store_id", activeStore.id);
    const { data } = await query;
    setTickets((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchTickets(); }, [user, activeStore]);

  // Real-time
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("support-tickets-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `user_id=eq.${user.id}` }, () => fetchTickets())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchMessages = async (ticketId: string) => {
    const { data } = await supabase.from("support_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
    setMessages((data as any[]) || []);
  };

  const openTicketDetail = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setDetailOpen(true);
    fetchMessages(ticket.id);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket || !user) return;
    setSendingMsg(true);
    const { error } = await supabase.from("support_messages").insert({ ticket_id: selectedTicket.id, user_id: effectiveUserId!, message: newMessage.trim(), sender_type: "user" } as any);
    if (!error) {
      setNewMessage("");
      fetchMessages(selectedTicket.id);
      toast.success("Message sent");
    } else toast.error("Failed to send message");
    setSendingMsg(false);
  };

  const handleCreateTicket = async () => {
    if (!user || !form.subject.trim()) { toast.error("Subject is required"); return; }
    const payload: any = { user_id: effectiveUserId!, store_id: activeStore?.id || null, ...form };
    if (editingTicket) {
      const { error } = await supabase.from("support_tickets").update(payload).eq("id", editingTicket.id);
      if (!error) { toast.success("Ticket updated"); setSheetOpen(false); resetForm(); fetchTickets(); } else toast.error("Update failed");
    } else {
      const { error } = await supabase.from("support_tickets").insert(payload);
      if (!error) { toast.success("Ticket created"); setSheetOpen(false); resetForm(); fetchTickets(); } else toast.error("Create failed");
    }
  };

  const handleDeleteTicket = async (id: string) => {
    const { error } = await supabase.from("support_tickets").delete().eq("id", id);
    if (!error) { toast.success("Ticket deleted"); fetchTickets(); } else toast.error("Delete failed");
  };

  const resetForm = () => { setForm({ subject: "", description: "", category: "general", priority: "medium" }); setEditingTicket(null); };

  const openEdit = (t: SupportTicket) => {
    setEditingTicket(t);
    setForm({ subject: t.subject, description: t.description, category: t.category, priority: t.priority });
    setSheetOpen(true);
  };

  // Stats
  const stats = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter(t => t.status === "open").length;
    const inProgress = tickets.filter(t => t.status === "in_progress").length;
    const resolved = tickets.filter(t => t.status === "resolved" || t.status === "closed").length;
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
    return { total, open, inProgress, resolved, resolutionRate };
  }, [tickets]);

  // Filter
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (searchQuery && !t.subject.toLowerCase().includes(searchQuery.toLowerCase()) && !t.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [tickets, statusFilter, categoryFilter, searchQuery]);

  const filteredGuides = GUIDES.filter(g =>
    g.title[lang].toLowerCase().includes(guideSearch.toLowerCase()) ||
    g.steps[lang].some(s => s.toLowerCase().includes(guideSearch.toLowerCase()))
  );

  const headings: Record<Lang, Record<string, string>> = {
    en: { services: "Our Digital Services", guide: "Step-by-Step Guide", faq: "Frequently Asked Questions", contact: "Need More Help?", searchPh: "Search guides..." },
    bn: { services: "আমাদের ডিজিটাল সেবাসমূহ", guide: "ধাপে ধাপে গাইড", faq: "সচরাচর জিজ্ঞাসা", contact: "আরও সাহায্য দরকার?", searchPh: "গাইড সার্চ করুন..." },
    hi: { services: "हमारी डिजिटल सेवाएं", guide: "चरण-दर-चरण गाइड", faq: "अक्सर पूछे जाने वाले प्रश्न", contact: "और मदद चाहिए?", searchPh: "गाइड खोजें..." },
  };
  const t = headings[lang];

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Headphones className="h-4 w-4 text-primary" />
              </div>
              Support & Services
            </h1>
            <p className="text-muted-foreground text-sm mt-1">EvixPOS — Your Digital Growth Partner</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(["en", "bn", "hi"] as Lang[]).map(l => (
                <Button key={l} size="sm" variant={lang === l ? "default" : "outline"} onClick={() => setLang(l)} className="rounded-full px-3 text-xs h-7">
                  {LANG_LABELS[l]}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Tickets", value: stats.total, icon: Ticket, color: "text-primary", bg: "bg-primary/10" },
            { label: "Open", value: stats.open, icon: AlertCircle, color: "text-blue-600", bg: "bg-blue-500/10" },
            { label: "In Progress", value: stats.inProgress, icon: Clock, color: "text-orange-600", bg: "bg-orange-500/10" },
            { label: "Resolved", value: stats.resolved, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/10" },
          ].map((kpi, i) => (
            <Card key={i} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`h-8 w-8 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                    <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  </div>
                  <span className="text-2xl font-bold">{kpi.value}</span>
                </div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                {i === 3 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Resolution Rate</span>
                      <span className="font-medium">{stats.resolutionRate}%</span>
                    </div>
                    <Progress value={stats.resolutionRate} className="h-1.5" />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 h-10">
            <TabsTrigger value="tickets" className="text-xs sm:text-sm gap-1"><Ticket className="h-3.5 w-3.5 hidden sm:inline" />Tickets</TabsTrigger>
            <TabsTrigger value="services" className="text-xs sm:text-sm gap-1"><Zap className="h-3.5 w-3.5 hidden sm:inline" />Services</TabsTrigger>
            <TabsTrigger value="guides" className="text-xs sm:text-sm gap-1"><BookOpen className="h-3.5 w-3.5 hidden sm:inline" />Guides</TabsTrigger>
            <TabsTrigger value="faq" className="text-xs sm:text-sm gap-1"><HelpCircle className="h-3.5 w-3.5 hidden sm:inline" />FAQ</TabsTrigger>
          </TabsList>

          {/* ===== TICKETS TAB ===== */}
          <TabsContent value="tickets" className="space-y-4 mt-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search tickets..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]"><Filter className="h-3.5 w-3.5 mr-1" /><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Category</SelectItem>
                    {CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Sheet open={sheetOpen} onOpenChange={v => { setSheetOpen(v); if (!v) resetForm(); }}>
                  <SheetTrigger asChild>
                    <Button size="sm" className="gap-1"><Plus className="h-4 w-4" />New Ticket</Button>
                  </SheetTrigger>
                  <SheetContent className="overflow-y-auto">
                    <SheetHeader><SheetTitle>{editingTicket ? "Edit Ticket" : "Create Support Ticket"}</SheetTitle></SheetHeader>
                    <div className="space-y-4 mt-6">
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Subject *</label>
                        <Input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Brief summary of your issue" />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Description</label>
                        <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe your issue in detail..." rows={5} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium mb-1.5 block">Category</label>
                          <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1.5 block">Priority</label>
                          <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Live Preview */}
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Preview</label>
                        <Card className="border-border/50">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-sm">{form.subject || "Ticket subject..."}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{form.description || "Description..."}</p>
                              </div>
                              <Badge variant="outline" className={`text-[10px] ${PRIORITY_CONFIG[form.priority]?.color}`}>{PRIORITY_CONFIG[form.priority]?.label}</Badge>
                            </div>
                            <div className="flex gap-2 mt-2">
                              <Badge variant="secondary" className="text-[10px]">{CATEGORY_OPTIONS.find(c => c.value === form.category)?.label}</Badge>
                              <Badge variant="outline" className="text-[10px] text-blue-600">Open</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      <Button onClick={handleCreateTicket} className="w-full">{editingTicket ? "Update Ticket" : "Submit Ticket"}</Button>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            {/* Ticket List */}
            {loading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filteredTickets.length === 0 ? (
              <Card className="border-border/50 border-dashed">
                <CardContent className="py-16 text-center">
                  <Ticket className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="font-medium text-muted-foreground">No tickets found</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Create a new ticket to get started</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredTickets.map(ticket => {
                  const statusConf = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
                  const priorityConf = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;
                  const StatusIcon = statusConf.icon;
                  return (
                    <Card key={ticket.id} className="border-border/50 hover:shadow-md transition-all cursor-pointer group" onClick={() => openTicketDetail(ticket)}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <StatusIcon className={`h-4 w-4 flex-shrink-0 ${statusConf.color}`} />
                              <h4 className="font-semibold text-sm truncate">{ticket.subject}</h4>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1 ml-6">{ticket.description}</p>
                            <div className="flex items-center gap-2 mt-2 ml-6">
                              <Badge variant="secondary" className="text-[10px]">{CATEGORY_OPTIONS.find(c => c.value === ticket.category)?.label || ticket.category}</Badge>
                              <Badge variant="outline" className={`text-[10px] ${priorityConf.color}`}>{priorityConf.label}</Badge>
                              <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ticket)}><FileText className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteTicket(ticket.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ===== SERVICES TAB ===== */}
          <TabsContent value="services" className="space-y-6 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {SERVICES.map((s, i) => {
                const Icon = s.icon;
                return (
                  <Card key={i} className="border-border/50 hover:shadow-md transition-all group cursor-pointer">
                    <CardContent className="p-5">
                      <div className={`h-11 w-11 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                        <Icon className={`h-5 w-5 ${s.color}`} />
                      </div>
                      <h4 className="font-semibold text-sm">{s.title[lang]}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{s.desc[lang]}</p>
                      <Button variant="ghost" size="sm" className="mt-3 h-7 text-xs gap-1 p-0 text-primary">
                        Learn More <ArrowUpRight className="h-3 w-3" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Contact */}
            <Card className="border-border/50">
              <CardContent className="p-6">
                <h3 className="font-bold text-center mb-4">{t.contact}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { icon: MessageCircle, label: "WhatsApp", value: "+880 1XXXXXXXXX", color: "text-emerald-500", bg: "bg-emerald-500/10" },
                    { icon: Mail, label: "Email", value: "support@evixpos.com", color: "text-primary", bg: "bg-primary/10" },
                    { icon: Headphones, label: "Live Chat", value: "24/7 Support", color: "text-orange-500", bg: "bg-orange-500/10" },
                  ].map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className={`h-10 w-10 rounded-full ${c.bg} flex items-center justify-center`}>
                        <c.icon className={`h-5 w-5 ${c.color}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{c.label}</p>
                        <p className="text-xs text-muted-foreground">{c.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== GUIDES TAB ===== */}
          <TabsContent value="guides" className="space-y-4 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t.searchPh} value={guideSearch} onChange={e => setGuideSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="space-y-2">
              {filteredGuides.map(guide => {
                const Icon = guide.icon;
                const isOpen = expandedGuide === guide.id;
                return (
                  <Card key={guide.id} className="border-border/50 overflow-hidden">
                    <button onClick={() => setExpandedGuide(isOpen ? null : guide.id)} className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="h-4 w-4 text-primary" /></div>
                        <span className="font-medium text-sm">{guide.title[lang]}</span>
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {isOpen && (
                      <CardContent className="pt-0 pb-4">
                        <div className="space-y-3 pl-12">
                          {guide.steps[lang].map((step, i) => (
                            <div key={i} className="flex gap-3 items-start">
                              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                                <span className="text-xs font-bold text-primary">{i + 1}</span>
                              </div>
                              <p className="text-sm text-muted-foreground leading-relaxed">{step}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ===== FAQ TAB ===== */}
          <TabsContent value="faq" className="space-y-2 mt-4">
            {FAQS.map((faq, i) => {
              const isOpen = expandedFaq === i;
              return (
                <Card key={i} className="border-border/50">
                  <button onClick={() => setExpandedFaq(isOpen ? null : i)} className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <HelpCircle className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-sm">{faq.q[lang]}</span>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {isOpen && (
                    <CardContent className="pt-0 pb-4">
                      <p className="text-sm text-muted-foreground leading-relaxed pl-7">{faq.a[lang]}</p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>

        {/* Ticket Detail Sheet */}
        <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
          <SheetContent className="overflow-y-auto sm:max-w-lg">
            {selectedTicket && (
              <>
                <SheetHeader>
                  <SheetTitle className="text-left">{selectedTicket.subject}</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-4">
                  {/* Ticket Info */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={STATUS_CONFIG[selectedTicket.status]?.color}>{STATUS_CONFIG[selectedTicket.status]?.label}</Badge>
                    <Badge variant="outline" className={PRIORITY_CONFIG[selectedTicket.priority]?.color}>{PRIORITY_CONFIG[selectedTicket.priority]?.label}</Badge>
                    <Badge variant="secondary">{CATEGORY_OPTIONS.find(c => c.value === selectedTicket.category)?.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{selectedTicket.description}</p>
                  <p className="text-xs text-muted-foreground">Created {format(new Date(selectedTicket.created_at), "PPp")}</p>

                  <Separator />

                  {/* Messages */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><MessageCircle className="h-4 w-4" />Conversation</h4>
                    <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                      {messages.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-8">No messages yet. Start the conversation.</p>
                      ) : messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.sender_type === "user" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${msg.sender_type === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            <p>{msg.message}</p>
                            <p className={`text-[10px] mt-1 ${msg.sender_type === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {format(new Date(msg.created_at), "p")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Send Message */}
                  <div className="flex gap-2">
                    <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type a message..." onKeyDown={e => e.key === "Enter" && handleSendMessage()} />
                    <Button size="icon" onClick={handleSendMessage} disabled={sendingMsg || !newMessage.trim()}>
                      {sendingMsg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
};

export default SupportPage;
