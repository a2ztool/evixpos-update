import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, X, Send, Facebook, Instagram, Play,
  Home, HelpCircle, MessagesSquare, ChevronRight, ChevronDown, Globe, Search
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { useLandingContent } from "@/hooks/useLandingContent";
import brandLogo from "@/assets/evixPos.png";

interface ChatMessage {
  id: string;
  sender_type: "visitor" | "admin";
  message: string;
  created_at: string;
}

type Tab = "home" | "help" | "chat";
type Lang = "en" | "bn" | "hi";

const LANG_LABELS: Record<Lang, string> = { en: "English", bn: "বাংলা", hi: "हिन्दी" };

const HELP_CATEGORIES: Record<string, { en: string; bn: string; hi: string; keywords: string[] }> = {
  getting_started: { en: "Getting Started", bn: "শুরু করুন", hi: "शुरू करें", keywords: ["order", "product", "customer", "create", "add"] },
  features: { en: "Features", bn: "ফিচার", hi: "सुविधाएं", keywords: ["pos", "report", "subscription", "whatsapp", "integration"] },
  account: { en: "Account & Settings", bn: "অ্যাকাউন্ট ও সেটিংস", hi: "खाता और सेटिंग्स", keywords: ["setting", "plan", "upgrade", "support", "contact"] },
};

const getVisitorId = (): string => {
  let id = sessionStorage.getItem("chat_visitor_id");
  if (!id) {
    id = `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem("chat_visitor_id", id);
  }
  return id;
};

// Visitor-scoped client that sends the visitor id header so RLS policies
// can scope chat_sessions/chat_messages rows to this visitor only.
const SUPABASE_URL = "https://vuuesqrdjuqnduhiihwz.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dWVzcXJkanVxbmR1aGlpaHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDUxNDAsImV4cCI6MjA5MTEyMTE0MH0.VWuaxpk0t6UnkZTt8H7Z0t-JcsAVRdGoxfpu2OpI_ZM";
const getVisitorClient = () => {
  const visitorId = getVisitorId();
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-visitor-id": visitorId } },
  });
};

const LandingChatbot = () => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [lang, setLang] = useState<Lang>("en");
  const [langOpen, setLangOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [expandedHelp, setExpandedHelp] = useState<number | null>(null);
  const [helpSearch, setHelpSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { get } = useLandingContent();

  const welcomeMsg = get("chat_welcome", "👋 Hi! Welcome to EvixPOS. How can we help you today?");
  const subtitle = get("chat_subtitle", "We typically reply in under 30 minutes");
  const autoReply = get("chat_auto_reply", "Thanks for your message! Our team will reply shortly.");
  const autoReplyEnabled = get("chat_auto_reply_enabled", "true") === "true";
  const fbUrl = get("chat_facebook_url", "https://facebook.com/evixpos");
  const igUrl = get("chat_instagram_url", "https://instagram.com/evixpos");
  const howItWorksUrl = get("chat_howItWorks_url", "");

  const getHelpItems = () => {
    const items: { title: string; body: string; titleRaw: string }[] = [];
    for (let i = 1; i <= 20; i++) {
      const title = get(`chat_help_${i}_title`);
      const body = get(`chat_help_${i}_body`);
      if (!title) break;
      const langIdx = lang === "en" ? 0 : lang === "bn" ? 1 : 2;
      const bodyParts = body.split("|").map((s) => s.trim());
      items.push({ title, titleRaw: title.toLowerCase(), body: bodyParts[langIdx] || bodyParts[0] || body });
    }
    return items;
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
  }, []);

  useEffect(() => {
    const visitorId = getVisitorId();
    const vsb = getVisitorClient();
    const initSession = async () => {
      const { data: existing } = await vsb
        .from("chat_sessions")
        .select("id")
        .eq("visitor_id", visitorId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        setSessionId(existing.id);
        const { data: msgs } = await vsb
          .from("chat_messages")
          .select("*")
          .eq("session_id", existing.id)
          .order("created_at", { ascending: true });
        if (msgs) setMessages(msgs as ChatMessage[]);
      }
    };
    initSession();
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`chat-${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const newMsg = payload.new as ChatMessage;
        if (newMsg.sender_type === "admin") {
          setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
          if (!open || tab !== "chat") setUnread((c) => c + 1);
          scrollToBottom();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, open, tab, scrollToBottom]);

  useEffect(() => { if (open && tab === "chat") scrollToBottom(); }, [open, tab, messages.length, scrollToBottom]);

  const createSession = async () => {
    const visitorId = getVisitorId();
    const { data } = await getVisitorClient()
      .from("chat_sessions")
      .insert({ visitor_id: visitorId, visitor_name: "Visitor" })
      .select("id")
      .single();
    if (data) { setSessionId(data.id); return data.id; }
    return null;
  };

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput("");
    setTab("chat");

    let sid = sessionId;
    if (!sid) sid = await createSession();
    if (!sid) return;

    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`,
      sender_type: "visitor",
      message: msg,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    scrollToBottom();

    const vsb = getVisitorClient();
    const { data } = await vsb
      .from("chat_messages")
      .insert({ session_id: sid, sender_type: "visitor", message: msg })
      .select()
      .single();
    if (data) setMessages((prev) => prev.map((m) => m.id === optimistic.id ? (data as ChatMessage) : m));

    await vsb.from("chat_sessions").update({ last_message_at: new Date().toISOString(), is_read: false }).eq("id", sid);

    // Notify all admins of new landing chat (only first message in session triggers, dedup handles rest)
    try {
      const { notifyAdminsLandingMessage } = await import("@/lib/notificationTriggers");
      await notifyAdminsLandingMessage("Visitor", msg);
    } catch {}

    if (autoReplyEnabled && messages.filter((m) => m.sender_type === "visitor").length === 0) {
      setTyping(true);
      setTimeout(async () => {
        const { data: reply } = await vsb
          .from("chat_messages")
          .insert({ session_id: sid!, sender_type: "admin", message: autoReply })
          .select()
          .single();
        if (reply) setMessages((prev) => [...prev, reply as ChatMessage]);
        setTyping(false);
        scrollToBottom();
      }, 1500);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setUnread(0);
  };

  const helpItems = getHelpItems();

  // Filter help items by search and category
  const filteredHelp = helpItems.filter((item) => {
    const matchesSearch = !helpSearch || item.titleRaw.includes(helpSearch.toLowerCase()) || item.body.toLowerCase().includes(helpSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (!selectedCategory) return true;
    const cat = HELP_CATEGORIES[selectedCategory];
    if (!cat) return true;
    return cat.keywords.some((kw) => item.titleRaw.includes(kw));
  });

  const socialLinks = [
    { icon: Facebook, label: "Facebook", url: fbUrl, color: "bg-blue-50 text-blue-600" },
    { icon: Instagram, label: "Instagram", url: igUrl, color: "bg-pink-50 text-pink-600" },
  ];

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={handleOpen}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-500/25 flex items-center justify-center"
          >
            <MessageCircle className="w-6 h-6" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold animate-pulse">
                {unread}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Widget */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed z-50 rounded-2xl overflow-hidden shadow-2xl shadow-black/15 border border-gray-200 flex flex-col bg-white
              bottom-0 right-0 w-full h-full sm:bottom-6 sm:right-6 sm:w-[380px] sm:max-w-[calc(100vw-2rem)] sm:h-[560px] sm:max-h-[calc(100vh-3rem)] sm:rounded-2xl rounded-none"
          >
            {/* Header */}
            <div className="relative px-5 pt-5 pb-4 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 shrink-0">
              <button
                onClick={() => setOpen(false)}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-white/30 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Language Selector */}
              <div className="absolute top-3 right-12">
                <button
                  onClick={() => setLangOpen(!langOpen)}
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white/90 text-[11px] hover:bg-white/30 transition-colors"
                >
                  <Globe className="w-3 h-3" />
                  {LANG_LABELS[lang]}
                  <ChevronDown className="w-3 h-3" />
                </button>
                <AnimatePresence>
                  {langOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden z-10"
                    >
                      {(["en", "bn", "hi"] as Lang[]).map((l) => (
                        <button
                          key={l}
                          onClick={() => { setLang(l); setLangOpen(false); }}
                          className={`block w-full px-4 py-2 text-left text-xs hover:bg-gray-50 transition-colors ${lang === l ? "text-emerald-600 font-semibold bg-emerald-50" : "text-gray-700"}`}
                        >
                          {LANG_LABELS[l]}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-3 mb-1">
                <img src={brandLogo} alt="EvixPOS" className="w-9 h-9 rounded-lg bg-white/20 p-1 object-contain" />
              </div>
              <h3 className="text-white font-bold text-lg leading-tight mt-2">
                {lang === "bn" ? "EvixPOS এ স্বাগতম!" : lang === "hi" ? "EvixPOS में आपका स्वागत है!" : "Welcome to the\nEvixPOS !"}
              </h3>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* HOME TAB */}
              {tab === "home" && (
                <div className="p-4 space-y-3">
                  <button
                    onClick={() => { setTab("chat"); setTimeout(() => inputRef.current?.focus(), 200); }}
                    className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-emerald-300 hover:shadow-sm transition-all bg-white group"
                  >
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-gray-800">
                        {lang === "bn" ? "আমাদের মেসেজ পাঠান" : lang === "hi" ? "हमें संदेश भेजें" : "Send us a message"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 transition-colors">
                      <Send className="w-4 h-4 text-white" />
                    </div>
                  </button>

                  {socialLinks.map((s) => (
                    <a
                      key={s.label}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all bg-white"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.color}`}>
                        <s.icon className="w-4 h-4" />
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-700">{s.label}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </a>
                  ))}

                  {howItWorksUrl ? (
                    <a
                      href={howItWorksUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all bg-white"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center">
                        <Play className="w-4 h-4" />
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-700">
                        {lang === "bn" ? "কিভাবে কাজ করে?" : lang === "hi" ? "कैसे काम करता है?" : "How It Works?"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </a>
                  ) : (
                    <button
                      onClick={() => setTab("help")}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all bg-white"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center">
                        <Play className="w-4 h-4" />
                      </div>
                      <span className="flex-1 text-left text-sm font-medium text-gray-700">
                        {lang === "bn" ? "কিভাবে কাজ করে?" : lang === "hi" ? "कैसे काम करता है?" : "How It Works?"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                </div>
              )}

              {/* HELP TAB */}
              {tab === "help" && (
                <div className="p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-emerald-500" />
                    {lang === "bn" ? "সাহায্য কেন্দ্র" : lang === "hi" ? "सहायता केंद्र" : "Help Center"}
                  </h4>

                  {/* Search */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={helpSearch}
                      onChange={(e) => setHelpSearch(e.target.value)}
                      placeholder={lang === "bn" ? "সাহায্য খুঁজুন..." : lang === "hi" ? "सहायता खोजें..." : "Search help..."}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-gray-50"
                    />
                  </div>

                  {/* Category pills */}
                  <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                        !selectedCategory ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {lang === "bn" ? "সব" : lang === "hi" ? "सभी" : "All"}
                    </button>
                    {Object.entries(HELP_CATEGORIES).map(([key, cat]) => (
                      <button
                        key={key}
                        onClick={() => setSelectedCategory(selectedCategory === key ? null : key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                          selectedCategory === key ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {cat[lang]}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {filteredHelp.map((item, i) => {
                      const originalIndex = helpItems.indexOf(item);
                      return (
                        <div key={originalIndex} className="rounded-xl border border-gray-200 overflow-hidden">
                          <button
                            onClick={() => setExpandedHelp(expandedHelp === originalIndex ? null : originalIndex)}
                            className="w-full flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors"
                          >
                            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">
                              {originalIndex + 1}
                            </div>
                            <span className="flex-1 text-left text-sm font-medium text-gray-700">{item.title}</span>
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expandedHelp === originalIndex ? "rotate-180" : ""}`} />
                          </button>
                          <AnimatePresence>
                            {expandedHelp === originalIndex && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="px-4 pb-3.5 text-xs text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                                  {item.body}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                    {filteredHelp.length === 0 && (
                      <div className="text-center py-8">
                        <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">
                          {lang === "bn" ? "কোনো ফলাফল পাওয়া যায়নি" : lang === "hi" ? "कोई परिणाम नहीं मिला" : "No results found"}
                        </p>
                        <button
                          onClick={() => { setHelpSearch(""); setSelectedCategory(null); }}
                          className="text-xs text-emerald-600 mt-1 hover:underline"
                        >
                          {lang === "bn" ? "সব দেখুন" : lang === "hi" ? "सभी देखें" : "Show all"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CHAT TAB */}
              {tab === "chat" && (
                <div className="flex flex-col h-full">
                  <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ minHeight: 0 }}>
                    <div className="flex gap-2">
                      <img src={brandLogo} alt="" className="w-7 h-7 rounded-full object-contain bg-emerald-50 p-0.5 shrink-0 mt-1" />
                      <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-tl-md px-4 py-2.5 text-sm max-w-[80%]">
                        {welcomeMsg}
                      </div>
                    </div>

                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex gap-2 ${msg.sender_type === "visitor" ? "justify-end" : ""}`}>
                        {msg.sender_type === "admin" && (
                          <img src={brandLogo} alt="" className="w-7 h-7 rounded-full object-contain bg-emerald-50 p-0.5 shrink-0 mt-1" />
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2.5 text-sm max-w-[80%] ${
                            msg.sender_type === "visitor"
                              ? "bg-emerald-500 text-white rounded-tr-md"
                              : "bg-gray-100 text-gray-800 rounded-tl-md"
                          }`}
                        >
                          {msg.message}
                          <div className={`text-[10px] mt-1 ${msg.sender_type === "visitor" ? "text-emerald-100" : "text-gray-400"}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    ))}

                    {typing && (
                      <div className="flex gap-2">
                        <img src={brandLogo} alt="" className="w-7 h-7 rounded-full object-contain bg-emerald-50 p-0.5 shrink-0" />
                        <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3">
                          <div className="flex gap-1">
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            {tab === "chat" && (
              <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
                <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={lang === "bn" ? "মেসেজ লিখুন..." : lang === "hi" ? "संदेश लिखें..." : "Type a message..."}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* Bottom Tab Bar */}
            <div className="flex border-t border-gray-200 bg-white shrink-0">
              {([
                { key: "home" as Tab, icon: Home, label: lang === "bn" ? "হোম" : lang === "hi" ? "होम" : "Home" },
                { key: "help" as Tab, icon: HelpCircle, label: lang === "bn" ? "সাহায্য" : lang === "hi" ? "सहायता" : "Help" },
                { key: "chat" as Tab, icon: MessagesSquare, label: lang === "bn" ? "চ্যাট" : lang === "hi" ? "चैट" : "Chat" },
              ]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); if (t.key === "chat") { setUnread(0); setTimeout(() => inputRef.current?.focus(), 200); } }}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative ${
                    tab === t.key ? "text-emerald-600" : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <t.icon className="w-5 h-5" />
                  <span className="text-[11px] font-medium">{t.label}</span>
                  {t.key === "chat" && unread > 0 && (
                    <span className="absolute top-2 right-[calc(50%-2px)] translate-x-3 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                      {unread}
                    </span>
                  )}
                  {tab === t.key && (
                    <motion.div layoutId="chatTab" className="absolute bottom-0 left-2 right-2 h-0.5 bg-emerald-500 rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default LandingChatbot;
