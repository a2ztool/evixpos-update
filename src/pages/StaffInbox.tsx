import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { useStore } from "@/contexts/StoreContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  MessageSquare, Send, Search, User, ArrowLeft, Check, CheckCheck,
  Volume2, VolumeX, FileText, ListTodo, Paperclip
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  auth_user_id: string | null;
  is_active: boolean;
}

interface StaffMessage {
  id: string;
  store_id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  message_type: string;
  file_url: string | null;
  file_name: string | null;
  task_title: string | null;
  task_status: string | null;
  is_read: boolean;
  created_at: string;
}

const notificationSound = typeof Audio !== "undefined" ? new Audio("data:audio/wav;base64,UklGRl9vT19teleXhBVkUgT09PUABAAAABAAEARKwAAIhYAQACABAAZGF0YQoAAAD//wIA") : null;

const StaffInbox = () => {
  const { user } = useAuth();
  const { isStaff, staffInfo } = useStaff();
  const { activeStore } = useStore();

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const storeId = isStaff ? staffInfo?.store_id : activeStore?.id;
  const myId = user?.id;

  // For owner: show staff list. For staff: show owner + other staff
  const fetchContacts = useCallback(async () => {
    if (!storeId || !myId) return;
    setLoading(true);

    const { data } = await supabase
      .from("staff_members")
      .select("id, name, email, role, auth_user_id, is_active")
      .eq("store_id", storeId)
      .eq("is_active", true);

    if (data) {
      if (isStaff) {
        // Staff sees owner + other staff (filter out self)
        setStaffList(data.filter(s => s.auth_user_id !== myId) as StaffMember[]);
      } else {
        // Owner sees all staff
        setStaffList(data as StaffMember[]);
      }
    }
    setLoading(false);
  }, [storeId, myId, isStaff]);

  // Fetch unread counts per contact
  const fetchUnreadCounts = useCallback(async () => {
    if (!storeId || !myId) return;
    const { data } = await supabase
      .from("staff_messages")
      .select("sender_id")
      .eq("store_id", storeId)
      .eq("receiver_id", myId)
      .eq("is_read", false);

    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((m: any) => {
        counts[m.sender_id] = (counts[m.sender_id] || 0) + 1;
      });
      setUnreadCounts(counts);
    }
  }, [storeId, myId]);

  useEffect(() => {
    fetchContacts();
    fetchUnreadCounts();
  }, [fetchContacts, fetchUnreadCounts]);

  // Load messages for active chat
  useEffect(() => {
    if (!activeChat || !storeId || !myId) { setMessages([]); return; }

    const load = async () => {
      const { data } = await supabase
        .from("staff_messages")
        .select("*")
        .eq("store_id", storeId)
        .or(`and(sender_id.eq.${myId},receiver_id.eq.${activeChat}),and(sender_id.eq.${activeChat},receiver_id.eq.${myId})`)
        .order("created_at", { ascending: true });

      if (data) setMessages(data as StaffMessage[]);
      scrollToBottom();

      // Mark as read
      await supabase
        .from("staff_messages")
        .update({ is_read: true })
        .eq("store_id", storeId)
        .eq("sender_id", activeChat)
        .eq("receiver_id", myId)
        .eq("is_read", false);

      fetchUnreadCounts();
    };
    load();
  }, [activeChat, storeId, myId, fetchUnreadCounts]);

  // Real-time subscription
  useEffect(() => {
    if (!storeId || !myId) return;

    const channel = supabase
      .channel(`staff-inbox-${storeId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "staff_messages",
        filter: `store_id=eq.${storeId}`,
      }, (payload) => {
        const msg = payload.new as StaffMessage;
        // If message is in active chat
        if (
          (msg.sender_id === activeChat && msg.receiver_id === myId) ||
          (msg.sender_id === myId && msg.receiver_id === activeChat)
        ) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          scrollToBottom();
          // Auto mark read if I'm receiver
          if (msg.receiver_id === myId) {
            supabase.from("staff_messages").update({ is_read: true }).eq("id", msg.id).then();
          }
        }
        // Play sound for incoming
        if (msg.receiver_id === myId && msg.sender_id !== myId && soundEnabled) {
          notificationSound?.play().catch(() => {});
        }
        fetchUnreadCounts();
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "staff_messages",
        filter: `store_id=eq.${storeId}`,
      }, (payload) => {
        const updated = payload.new as StaffMessage;
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [storeId, myId, activeChat, soundEnabled, fetchUnreadCounts]);

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 80);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeChat || !storeId || !myId) return;
    const msg = newMessage.trim();
    setNewMessage("");

    await supabase.from("staff_messages").insert({
      store_id: storeId,
      sender_id: myId,
      receiver_id: activeChat,
      message: msg,
      message_type: "text",
    });
  };

  const filteredContacts = useMemo(() => {
    if (!search) return staffList;
    const s = search.toLowerCase();
    return staffList.filter(c => c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s));
  }, [staffList, search]);

  const activePerson = staffList.find(s => s.auth_user_id === activeChat);
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  // For staff chatting with owner: owner's user_id is staffInfo.owner_id
  const ownerContact = isStaff ? {
    id: "owner",
    name: "Store Owner",
    email: "",
    role: "owner",
    auth_user_id: staffInfo?.owner_id ?? null,
    is_active: true,
  } : null;

  const allContacts = useMemo(() => {
    const contacts = [...filteredContacts];
    if (ownerContact && !contacts.find(c => c.auth_user_id === ownerContact.auth_user_id)) {
      contacts.unshift(ownerContact as StaffMember);
    }
    return contacts;
  }, [filteredContacts, ownerContact]);

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const formatMsgTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return format(d, "h:mm a");
    if (isYesterday(d)) return "Yesterday " + format(d, "h:mm a");
    return format(d, "MMM d, h:mm a");
  };

  const getContactChatId = (contact: StaffMember) => contact.auth_user_id;

  const showChat = activeChat !== null;

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-5rem)]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          {showChat && (
            <Button variant="ghost" size="icon" onClick={() => setActiveChat(null)} className="md:hidden h-8 w-8">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Staff Inbox</h1>
          {totalUnread > 0 && <Badge className="bg-primary text-primary-foreground text-xs">{totalUnread}</Badge>}
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="h-8 w-8 text-muted-foreground"
              title={soundEnabled ? "Mute notifications" : "Unmute notifications"}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex h-[calc(100%-2.5rem)] rounded-xl border border-border overflow-hidden bg-card">
          {/* Contact list */}
          <div className={cn(
            "w-full md:w-80 border-r border-border flex flex-col",
            showChat ? "hidden md:flex" : "flex"
          )}>
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 text-sm rounded-xl h-10"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              {loading ? (
                <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
              ) : allContacts.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No contacts found</p>
                </div>
              ) : (
                allContacts.map((contact) => {
                  const chatId = getContactChatId(contact);
                  if (!chatId) return null;
                  const unread = unreadCounts[chatId] || 0;
                  const isActive = activeChat === chatId;

                  return (
                    <button
                      key={contact.id}
                      onClick={() => setActiveChat(chatId)}
                      className={cn(
                        "w-full p-3.5 text-left border-b border-border/50 hover:bg-accent/50 transition-colors",
                        isActive && "bg-primary/5 border-l-2 border-l-primary",
                        unread > 0 && "bg-accent/30"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className={cn(
                            "text-xs font-medium",
                            contact.role === "owner" ? "bg-primary/20 text-primary" : "bg-accent text-accent-foreground"
                          )}>
                            {getInitials(contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={cn("text-sm font-medium truncate", unread > 0 ? "text-foreground" : "text-muted-foreground")}>
                              {contact.name}
                            </span>
                            {unread > 0 && (
                              <Badge className="bg-primary text-primary-foreground text-[10px] h-5 min-w-5 flex items-center justify-center rounded-full">
                                {unread}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="outline" className="text-[10px] capitalize h-4 px-1.5">{contact.role}</Badge>
                            <span className="text-[11px] text-muted-foreground truncate">{contact.email}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </ScrollArea>
          </div>

          {/* Chat area */}
          <div className={cn(
            "flex-1 flex flex-col",
            !showChat ? "hidden md:flex" : "flex"
          )}>
            {!activeChat ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="w-16 h-16 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Select a contact to start messaging</p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-card">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-medium">
                      {activePerson ? getInitials(activePerson.name) : (ownerContact?.auth_user_id === activeChat ? "SO" : "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {activePerson?.name || (ownerContact?.auth_user_id === activeChat ? "Store Owner" : "Unknown")}
                    </h3>
                    <p className="text-[11px] text-muted-foreground capitalize">
                      {activePerson?.role || "owner"}
                    </p>
                  </div>
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {messages.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-10">
                      No messages yet. Start the conversation!
                    </div>
                  )}
                  {messages.map((msg) => {
                    const isMine = msg.sender_id === myId;
                    return (
                      <div key={msg.id} className={cn("flex gap-2", isMine ? "justify-end" : "")}>
                        {!isMine && (
                          <Avatar className="h-7 w-7 shrink-0 mt-1">
                            <AvatarFallback className="bg-accent text-accent-foreground text-[10px]">
                              {activePerson ? getInitials(activePerson.name).charAt(0) : "S"}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className={cn(
                          "rounded-2xl px-3.5 py-2.5 text-sm max-w-[80%] md:max-w-[70%]",
                          isMine
                            ? "bg-primary text-primary-foreground rounded-tr-md"
                            : "bg-accent text-accent-foreground rounded-tl-md"
                        )}>
                          {msg.message_type === "task" && msg.task_title && (
                            <div className="flex items-center gap-1.5 mb-1.5 text-xs opacity-80">
                              <ListTodo className="w-3 h-3" />
                              <span className="font-medium">Task: {msg.task_title}</span>
                              <Badge variant="outline" className="text-[9px] h-4 capitalize">{msg.task_status}</Badge>
                            </div>
                          )}
                          {msg.message_type === "file" && msg.file_name && (
                            <div className="flex items-center gap-1.5 mb-1.5 text-xs opacity-80">
                              <FileText className="w-3 h-3" />
                              <span className="truncate">{msg.file_name}</span>
                            </div>
                          )}
                          <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                          <div className={cn(
                            "text-[10px] mt-1 flex items-center gap-1",
                            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {formatMsgTime(msg.created_at)}
                            {isMine && (msg.is_read ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Input */}
                <div className="px-4 py-3 border-t border-border bg-card">
                  <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                    <Input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="text-sm rounded-xl h-11 flex-1"
                    />
                    <Button type="submit" disabled={!newMessage.trim()} className="px-4 h-11 rounded-xl">
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default StaffInbox;
