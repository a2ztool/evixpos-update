import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageCircle, Send, Search, Circle, CheckCheck, Tag, Clock,
  User, Trash2, Archive, MoreVertical, Inbox, ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

interface Session {
  id: string; visitor_id: string; visitor_name: string; status: string;
  is_read: boolean; tags: string[]; last_message_at: string; created_at: string;
}

interface Message {
  id: string; session_id: string; sender_type: "visitor" | "admin";
  message: string; is_read: boolean; created_at: string;
}

const TAG_OPTIONS = ["lead", "support", "feedback", "spam"];

const AdminInbox = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
  }, []);

  const fetchSessions = useCallback(async () => {
    const { data } = await supabase.from("chat_sessions").select("*").order("last_message_at", { ascending: false });
    if (data) setSessions(data as Session[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_sessions" }, () => fetchSessions())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const msg = payload.new as Message;
        if (msg.session_id === activeSession) {
          setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
          scrollToBottom();
        }
        fetchSessions();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSession, fetchSessions, scrollToBottom]);

  useEffect(() => {
    if (!activeSession) { setMessages([]); return; }
    const load = async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("session_id", activeSession).order("created_at", { ascending: true });
      if (data) setMessages(data as Message[]);
      scrollToBottom();
      await supabase.from("chat_sessions").update({ is_read: true }).eq("id", activeSession);
      await supabase.from("chat_messages").update({ is_read: true }).eq("session_id", activeSession).eq("sender_type", "visitor");
      fetchSessions();
    };
    load();
  }, [activeSession, fetchSessions, scrollToBottom]);

  const sendReply = async () => {
    if (!reply.trim() || !activeSession) return;
    const msg = reply.trim(); setReply("");
    await supabase.from("chat_messages").insert({ session_id: activeSession, sender_type: "admin", message: msg });
    await supabase.from("chat_sessions").update({ last_message_at: new Date().toISOString() }).eq("id", activeSession);
  };

  const toggleTag = async (sessionId: string, tag: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const tags = session.tags || [];
    const newTags = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    await supabase.from("chat_sessions").update({ tags: newTags }).eq("id", sessionId);
    fetchSessions();
  };

  const closeSession = async (sessionId: string) => {
    await supabase.from("chat_sessions").update({ status: "closed" }).eq("id", sessionId);
    if (activeSession === sessionId) setActiveSession(null); fetchSessions();
  };

  const deleteSession = async (sessionId: string) => {
    await supabase.from("chat_messages").delete().eq("session_id", sessionId);
    await supabase.from("chat_sessions").delete().eq("id", sessionId);
    if (activeSession === sessionId) setActiveSession(null); fetchSessions();
  };

  const filtered = sessions.filter((s) =>
    s.visitor_name.toLowerCase().includes(search.toLowerCase()) || s.visitor_id.toLowerCase().includes(search.toLowerCase())
  );

  const activeSessionData = sessions.find((s) => s.id === activeSession);
  const unreadCount = sessions.filter((s) => !s.is_read).length;

  // Mobile: show either list or chat, not both
  const showChat = activeSession !== null;

  return (
    <div className="h-[calc(100vh-5rem)] md:h-[calc(100vh-5rem)]">
      <div className="flex items-center gap-3 mb-3 md:mb-4">
        {/* Mobile back button */}
        {showChat && (
          <Button variant="ghost" size="icon" onClick={() => setActiveSession(null)} className="md:hidden text-slate-400 hover:text-white h-8 w-8">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <Inbox className="h-5 w-5 md:h-6 md:w-6 text-emerald-400" />
        <h1 className="text-lg md:text-xl font-bold text-white">Inbox</h1>
        {unreadCount > 0 && <Badge className="bg-emerald-600 text-white text-xs">{unreadCount}</Badge>}
      </div>

      <div className="flex h-[calc(100%-2.5rem)] rounded-xl border border-slate-700 overflow-hidden bg-slate-800/50">
        {/* Sessions list - hidden on mobile when chat is open */}
        <div className={cn(
          "w-full md:w-80 border-r border-slate-700 flex flex-col",
          showChat ? "hidden md:flex" : "flex"
        )}>
          <div className="p-3 border-b border-slate-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-slate-900 border-slate-700 text-white text-sm rounded-xl h-10" />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-4 text-center text-slate-500 text-sm">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No conversations</p>
              </div>
            ) : (
              filtered.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSession(session.id)}
                  className={cn(
                    "w-full p-3.5 text-left border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors active:bg-slate-700/50",
                    activeSession === session.id && "bg-emerald-600/10 border-l-2 border-l-emerald-500",
                    !session.is_read && "bg-slate-700/20"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={cn("text-sm font-medium truncate", !session.is_read ? "text-white" : "text-slate-300")}>
                          {session.visitor_name}
                        </span>
                        <span className="text-[10px] text-slate-500 shrink-0 ml-2">
                          {formatDistanceToNow(new Date(session.last_message_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {!session.is_read && <Circle className="w-2 h-2 text-emerald-400 fill-emerald-400 shrink-0" />}
                        <span className="text-xs text-slate-500 truncate">{session.visitor_id.slice(0, 20)}...</span>
                      </div>
                      {session.tags?.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {session.tags.map((tag) => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Chat view - full width on mobile */}
        <div className={cn(
          "flex-1 flex flex-col",
          !showChat ? "hidden md:flex" : "flex"
        )}>
          {!activeSession ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Select a conversation</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-3 md:px-4 py-3 border-b border-slate-700 flex items-center justify-between bg-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-600/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{activeSessionData?.visitor_name}</h3>
                    <p className="text-[11px] text-slate-500">
                      {activeSessionData?.status === "open" ? "Active" : "Closed"} · {format(new Date(activeSessionData?.created_at || ""), "MMM d, h:mm a")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white h-8 w-8"><Tag className="w-4 h-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-slate-800 border-slate-700">
                      {TAG_OPTIONS.map((tag) => (
                        <DropdownMenuItem key={tag} onClick={() => toggleTag(activeSession!, tag)} className={cn("text-slate-300", activeSessionData?.tags?.includes(tag) && "text-emerald-400")}>
                          {activeSessionData?.tags?.includes(tag) ? "✓ " : ""}{tag}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-slate-800 border-slate-700">
                      <DropdownMenuItem onClick={() => closeSession(activeSession!)} className="text-slate-300"><Archive className="w-4 h-4 mr-2" /> Close</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteSession(activeSession!)} className="text-red-400"><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 md:px-4 py-4 space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-2 ${msg.sender_type === "admin" ? "justify-end" : ""}`}>
                    {msg.sender_type === "visitor" && (
                      <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    )}
                    <div className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-sm max-w-[80%] md:max-w-[70%]",
                      msg.sender_type === "admin" ? "bg-emerald-600 text-white rounded-tr-md" : "bg-slate-700/80 text-slate-200 rounded-tl-md"
                    )}>
                      {msg.message}
                      <div className={cn("text-[10px] mt-1 flex items-center gap-1", msg.sender_type === "admin" ? "text-emerald-200" : "text-slate-500")}>
                        {format(new Date(msg.created_at), "h:mm a")}
                        {msg.sender_type === "admin" && <CheckCheck className="w-3 h-3" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply */}
              {activeSessionData?.status === "open" && (
                <div className="px-3 md:px-4 py-3 border-t border-slate-700 bg-slate-800/80 pb-safe">
                  <form onSubmit={(e) => { e.preventDefault(); sendReply(); }} className="flex gap-2">
                    <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type reply..." className="bg-slate-900 border-slate-700 text-white text-sm rounded-xl h-11" />
                    <Button type="submit" disabled={!reply.trim()} className="bg-emerald-600 hover:bg-emerald-700 px-4 h-11 rounded-xl">
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminInbox;
