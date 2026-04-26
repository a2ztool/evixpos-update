import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  MessageSquare, Send, Volume2, VolumeX, Paperclip, X, ChevronDown, ArrowLeft, Users, ListTodo,
  ClipboardList, Package, Calendar, Link2, Info, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatFeatures, playNotificationSound } from "@/hooks/useChatFeatures";
import ChatMessageBubble, { ChatMessage } from "@/components/ChatMessageBubble";
import PinnedMessagesBar from "@/components/PinnedMessagesBar";
import { usePinMessage } from "@/hooks/usePinMessage";
import { parseTaskTitle } from "@/lib/chatHelpers";
import { toast } from "sonner";

const db = supabase as any;

type ConvType = "direct" | "group";
interface ConvItem {
  id: string;          // for direct = ownerId; for group = group_id
  type: ConvType;
  name: string;
  icon?: string;
  unread: number;
}

const FloatingInbox = () => {
  const { user } = useAuth();
  const { isStaff, staffInfo } = useStaff();

  const [open, setOpen] = useState(false);
  // view: "list" = back/list view; "chat" = active conversation
  const [view, setView] = useState<"list" | "chat">("list");
  const [activeConv, setActiveConv] = useState<ConvItem | null>(null);

  // Listen for toggle event from bottom nav
  useEffect(() => {
    const handler = () => setOpen(prev => !prev);
    window.addEventListener("toggle-floating-inbox", handler);
    return () => window.removeEventListener("toggle-floating-inbox", handler);
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; icon: string }[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadDirect, setUnreadDirect] = useState(0);
  const [unreadByGroup, setUnreadByGroup] = useState<Record<string, number>>({});
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [uploading, setUploading] = useState(false);
  // Assign Task (group only)
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [taskTerm, setTaskTerm] = useState("");
  const [taskRequiredInfo, setTaskRequiredInfo] = useState("");
  const [taskOrderId, setTaskOrderId] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderResults, setOrderResults] = useState<{ id: string; label: string }[]>([]);
  const [showOrderDropdown, setShowOrderDropdown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  const soundRef = useRef(soundEnabled);
  const activeConvRef = useRef<ConvItem | null>(activeConv);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { soundRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  const storeId = staffInfo?.store_id;
  const myId = user?.id;
  const ownerId = staffInfo?.owner_id ?? null;
  const hasStoreContext = !!storeId && !!myId && !!ownerId;

  const { addReaction, deleteForMe, deleteForEveryone, isVisible } = useChatFeatures(myId);
  const togglePin = usePinMessage(myId);
  const handlePinToggle = (m: ChatMessage) => togglePin(m, activeConvRef.current?.type === "group");

  // ─── Fetch groups (only ones staff is a member of) ───
  const fetchGroups = useCallback(async () => {
    if (!storeId || !myId) return;
    const { data: memberRows } = await db
      .from("chat_group_members")
      .select("group_id")
      .eq("user_id", myId);
    const ids = (memberRows || []).map((r: any) => r.group_id);
    if (ids.length === 0) { setGroups([]); return; }
    const { data } = await db
      .from("chat_groups")
      .select("id, name, icon")
      .eq("store_id", storeId)
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (data) setGroups(data);
  }, [storeId, myId]);

  // ─── Fetch unread (direct + group counts) ───
  const fetchUnread = useCallback(async () => {
    if (!storeId || !myId || !ownerId) return;
    const { data } = await supabase
      .from("staff_messages")
      .select("id")
      .eq("store_id", storeId)
      .eq("sender_id", ownerId)
      .eq("receiver_id", myId)
      .eq("is_read", false);
    setUnreadDirect(data?.length ?? 0);
  }, [storeId, myId, ownerId]);

  useEffect(() => {
    if (hasStoreContext) {
      fetchUnread();
      fetchGroups();
      setLoading(false);
    }
  }, [hasStoreContext, fetchUnread, fetchGroups]);

  // ─── Load messages when entering a conversation ───
  useEffect(() => {
    if (!open || view !== "chat" || !activeConv || !storeId || !myId) { setMessages([]); return; }
    const load = async () => {
      if (activeConv.type === "direct") {
        const peerId = activeConv.id;
        const { data } = await supabase
          .from("staff_messages")
          .select("*")
          .eq("store_id", storeId)
          .or(`and(sender_id.eq.${myId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${myId})`)
          .order("created_at", { ascending: true });
        if (data) setMessages(data as ChatMessage[]);
        scrollToBottom();
        await supabase
          .from("staff_messages")
          .update({ is_read: true })
          .eq("store_id", storeId)
          .eq("sender_id", peerId)
          .eq("receiver_id", myId)
          .eq("is_read", false);
        fetchUnread();
      } else {
        const { data } = await db
          .from("chat_group_messages")
          .select("*")
          .eq("group_id", activeConv.id)
          .order("created_at", { ascending: true })
          .limit(200);
        if (data) {
          const mapped: ChatMessage[] = data.map((m: any) => ({
            id: m.id, store_id: storeId, sender_id: m.sender_id, receiver_id: activeConv.id,
            message: m.message,
            message_type: m.type === "task" ? "task" : m.type === "system" ? "system" : "text",
            file_url: null, file_name: null,
            task_title: m.type === "task" ? (m.task_title || parseTaskTitle(m.message)) : null,
            task_status: m.type === "task" ? (m.task_status || "pending") : null,
            is_read: true, created_at: m.created_at,
            reply_to_id: m.reply_to_id || null, reactions: m.reactions || null,
            deleted_for: null, is_deleted_for_everyone: false,
            is_pinned: !!m.is_pinned, pinned_at: m.pinned_at ?? null, pinned_by: m.pinned_by ?? null,
          }));
          setMessages(mapped);
        }
        setUnreadByGroup(prev => ({ ...prev, [activeConv.id]: 0 }));
        scrollToBottom();
      }
    };
    load();
  }, [open, view, activeConv, storeId, myId, fetchUnread]);

  // ─── Realtime: direct messages ───
  useEffect(() => {
    if (!storeId || !myId || !ownerId) return;
    const channel = supabase
      .channel(`floating-direct-${storeId}-${myId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "staff_messages",
        filter: `store_id=eq.${storeId}`,
      }, (payload) => {
        const msg = payload.new as ChatMessage;
        const isRelevant =
          (msg.sender_id === ownerId && msg.receiver_id === myId) ||
          (msg.sender_id === myId && msg.receiver_id === ownerId);
        if (!isRelevant) return;
        const ac = activeConvRef.current;
        if (openRef.current && ac?.type === "direct" && ac.id === ownerId) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          scrollToBottom();
          if (msg.receiver_id === myId) {
            supabase.from("staff_messages").update({ is_read: true }).eq("id", msg.id).then();
          }
        }
        if (msg.receiver_id === myId && msg.sender_id !== myId && soundRef.current) {
          playNotificationSound();
        }
        fetchUnread();
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "staff_messages",
        filter: `store_id=eq.${storeId}`,
      }, (payload) => {
        const updated = payload.new as ChatMessage;
        const previous = payload.old as Partial<ChatMessage> | undefined;
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        const taskStatusChanged = previous && previous.task_status !== updated.task_status && updated.message_type === "task";
        if (taskStatusChanged && updated.sender_id === myId && soundRef.current) {
          playNotificationSound();
          toast.info(`Task "${updated.task_title || "Task"}" → ${updated.task_status}`);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, myId, ownerId, fetchUnread]);

  // ─── Realtime: group messages ───
  useEffect(() => {
    if (!storeId || !myId) return;
    const channel = supabase
      .channel(`floating-group-${storeId}-${myId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_group_messages" }, (payload) => {
        const m = payload.new as any;
        // RLS gates delivery: we'll only get messages from groups we belong to.
        // If the group is unknown locally, refresh group list.
        const known = groups.some(g => g.id === m.group_id);
        if (!known) { fetchGroups(); }
        const ac = activeConvRef.current;
        if (openRef.current && ac?.type === "group" && ac.id === m.group_id) {
          const isTask = m.type === "task";
          const mapped: ChatMessage = {
            id: m.id, store_id: storeId, sender_id: m.sender_id, receiver_id: m.group_id,
            message: m.message,
            message_type: isTask ? "task" : m.type === "system" ? "system" : "text",
            file_url: null, file_name: null,
            task_title: isTask ? (m.task_title || parseTaskTitle(m.message)) : null,
            task_status: isTask ? (m.task_status || "pending") : null,
            is_read: true, created_at: m.created_at,
            reply_to_id: m.reply_to_id || null, reactions: m.reactions || null,
            deleted_for: null, is_deleted_for_everyone: false,
            is_pinned: !!m.is_pinned, pinned_at: m.pinned_at ?? null, pinned_by: m.pinned_by ?? null,
          };
          setMessages(prev => prev.some(msg => msg.id === m.id) ? prev : [...prev, mapped]);
          scrollToBottom();
        } else if (m.sender_id !== myId) {
          setUnreadByGroup(prev => ({ ...prev, [m.group_id]: (prev[m.group_id] || 0) + 1 }));
          if (soundRef.current) playNotificationSound();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_group_messages" }, (payload) => {
        const m = payload.new as any;
        const previous = payload.old as any;
        const taskStatusChanged = previous && previous.task_status !== m.task_status && m.type === "task";
        setMessages(prev => prev.map(msg => msg.id === m.id
          ? { ...msg, message: m.message, reactions: m.reactions || null,
              task_status: m.task_status ?? msg.task_status,
              task_title: m.task_title ?? msg.task_title,
              is_pinned: !!m.is_pinned, pinned_at: m.pinned_at ?? null, pinned_by: m.pinned_by ?? null }
          : msg));
        if (taskStatusChanged && m.sender_id === myId && soundRef.current) {
          playNotificationSound();
          toast.info(`Task "${m.task_title || "Task"}" → ${m.task_status}`);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, myId, groups, fetchGroups]);

  // ─── Realtime: membership changes (e.g. owner adds staff to a new group) ───
  useEffect(() => {
    if (!storeId || !myId) return;
    const channel = supabase
      .channel(`floating-membership-${myId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "chat_group_members",
        filter: `user_id=eq.${myId}`,
      }, () => { fetchGroups(); })
      .on("postgres_changes", {
        event: "*", schema: "public", table: "chat_groups",
        filter: `store_id=eq.${storeId}`,
      }, () => { fetchGroups(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, myId, fetchGroups]);

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 80);
  };

  const scrollToMessage = (msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary/50", "rounded-xl");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary/50", "rounded-xl"), 2000);
    }
  };

  // Search orders for "Link Order"
  useEffect(() => {
    if (!taskOpen || !storeId) return;
    const t = setTimeout(async () => {
      const term = orderSearch.trim();
      let q = db.from("orders").select("id, total_amount, customer_id, created_at, customers(name)").eq("store_id", storeId).order("created_at", { ascending: false }).limit(8);
      if (term) {
        // try to match by id prefix
        q = q.ilike("id", `${term}%`);
      }
      const { data } = await q;
      setOrderResults((data || []).map((o: any) => ({
        id: o.id,
        label: `#${String(o.id).slice(0, 8)} · ${o.customers?.name || "Walk-in"} · ${Number(o.total_amount || 0).toFixed(2)}`,
      })));
    }, 250);
    return () => clearTimeout(t);
  }, [orderSearch, taskOpen, storeId]);

  const sendTask = async () => {
    if (!taskName.trim() || !activeConv || activeConv.type !== "group" || !storeId || !myId) return;
    let fullMessage = `📋 **Task Card**\n\n**Subscription:** ${taskName.trim()}`;
    if (taskTerm) fullMessage += `\n**Term:** ${taskTerm}`;
    if (taskOrderId) fullMessage += `\n**Linked Order:** #${taskOrderId.slice(0, 8)}`;
    if (taskRequiredInfo) fullMessage += `\n\n**Required Info:**\n${taskRequiredInfo}`;
    const { error } = await db.from("chat_group_messages").insert({
      group_id: activeConv.id, sender_id: myId, message: fullMessage, type: "task",
    });
    if (error) { toast.error("Failed to send task"); return; }
    toast.success("Task created!");
    setTaskName(""); setTaskTerm(""); setTaskRequiredInfo("");
    setTaskOrderId(null); setOrderSearch("");
    setTaskOpen(false);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConv || !storeId || !myId) return;
    const msg = newMessage.trim();
    const replyToId = replyTo?.id ?? null;
    setNewMessage("");
    setReplyTo(null);

    if (activeConv.type === "direct") {
      const peerId = activeConv.id;
      const tempId = `temp-${Date.now()}`;
      const optimisticMessage: ChatMessage = {
        id: tempId, store_id: storeId, sender_id: myId, receiver_id: peerId,
        message: msg, message_type: "text", file_url: null, file_name: null,
        task_title: null, task_status: null, is_read: false,
        created_at: new Date().toISOString(),
        reply_to_id: replyToId, reactions: null,
        deleted_for: null, is_deleted_for_everyone: false,
      };
      setMessages(prev => [...prev, optimisticMessage]);
      scrollToBottom();

      const insertData: any = {
        store_id: storeId, sender_id: myId, receiver_id: peerId,
        message: msg, message_type: "text",
      };
      if (replyToId) insertData.reply_to_id = replyToId;

      const { data, error } = await supabase
        .from("staff_messages").insert(insertData).select("*").single();

      if (error) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setNewMessage(msg);
        toast.error("Failed to send message");
        return;
      }
      setMessages(prev => {
        const without = prev.filter(m => m.id !== tempId);
        return without.some(m => m.id === data.id) ? without : [...without, data as ChatMessage];
      });
    } else {
      // group
      const insertData: any = { group_id: activeConv.id, sender_id: myId, message: msg, type: "text" };
      if (replyToId) insertData.reply_to_id = replyToId;
      const { error } = await db.from("chat_group_messages").insert(insertData);
      if (error) { toast.error("Failed to send"); setNewMessage(msg); }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv || !storeId || !myId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${storeId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("staff-chat").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("staff-chat").getPublicUrl(path);

      if (activeConv.type === "direct") {
        const { error } = await supabase.from("staff_messages").insert({
          store_id: storeId, sender_id: myId, receiver_id: activeConv.id,
          message: file.name, message_type: "file",
          file_url: urlData.publicUrl, file_name: file.name,
        });
        if (error) throw error;
      } else {
        const { error } = await db.from("chat_group_messages").insert({
          group_id: activeConv.id, sender_id: myId,
          message: `📎 [${file.name}](${urlData.publicUrl})`, type: "text",
        });
        if (error) throw error;
      }
      toast.success("File sent!");
    } catch (err: any) {
      toast.error("Upload failed: " + (err.message || "Unknown error"));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const visibleMessages = messages.filter(m => isVisible(m));
  const pinnedMessages = visibleMessages
    .filter(m => m.is_pinned && !m.is_deleted_for_everyone)
    .sort((a, b) => (a.pinned_at && b.pinned_at) ? new Date(b.pinned_at).getTime() - new Date(a.pinned_at).getTime() : 0);
  const totalUnread = unreadDirect + Object.values(unreadByGroup).reduce((a, b) => a + b, 0);

  if (!isStaff || !hasStoreContext) return null;

  // Build list items
  const listItems: ConvItem[] = [
    { id: ownerId!, type: "direct", name: "Store Admin", unread: unreadDirect },
    ...groups.map(g => ({
      id: g.id, type: "group" as const, name: g.name, icon: g.icon,
      unread: unreadByGroup[g.id] || 0,
    })),
  ];

  const openConversation = (conv: ConvItem) => {
    setActiveConv(conv);
    setView("chat");
  };

  const goBack = () => {
    setView("list");
    setActiveConv(null);
    setMessages([]);
    setReplyTo(null);
  };

  const closeWidget = () => {
    setOpen(false);
    // reset to list for next open
    setView("list");
    setActiveConv(null);
  };

  return (
    <>
      {/* Floating Chat Button - hidden on mobile since it's in bottom nav */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-50 hidden md:flex",
          "bottom-8 right-8",
          "h-14 w-14 rounded-full",
          "bg-primary text-primary-foreground",
          "items-center justify-center",
          "hover:scale-105 active:scale-95 transition-all duration-200",
          "shadow-[0_8px_30px_rgb(0,0,0,0.12)]",
          "ring-2 ring-primary/20 hover:ring-primary/40",
          open && "scale-0 opacity-0"
        )}
      >
        <MessageSquare className="h-6 w-6" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold h-5 min-w-5 flex items-center justify-center rounded-full px-1 shadow-lg">
            {totalUnread}
          </span>
        )}
      </button>

      {/* SaaS-Style Floating Chat Widget */}
      {open && (
        <div
          className={cn(
            "fixed z-50 bg-background overflow-hidden",
            "inset-0 w-full h-[100dvh] rounded-none",
            "shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.2)]",
            "md:bottom-8 md:right-8 md:left-auto md:top-auto",
            "md:w-[360px] md:h-[520px] md:max-h-[calc(100dvh-6rem)]",
            "md:rounded-[20px]",
            "md:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)]",
            "md:border md:border-border/50"
          )}
        >
          {/* Header - Fixed */}
          <div className="absolute top-0 left-0 right-0 z-10 px-3 py-3 border-b border-border/60 flex items-center gap-2 bg-card/95 backdrop-blur-sm">
            {view === "chat" ? (
              <>
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={goBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                {activeConv?.type === "group" ? (
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-base shrink-0">
                    {activeConv.icon || "👥"}
                  </div>
                ) : (
                  <Avatar className="h-9 w-9 ring-2 ring-primary/10 shrink-0">
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/30 text-primary text-xs font-medium">A</AvatarFallback>
                  </Avatar>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">
                    {activeConv?.name || "Chat"}
                  </h3>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    {activeConv?.type === "group" ? (
                      <><Users className="h-3 w-3" /> Group chat</>
                    ) : (
                      <>
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Online
                      </>
                    )}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">Inbox</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {totalUnread > 0 ? `${totalUnread} unread` : "All conversations"}
                  </p>
                </div>
              </>
            )}
            {view === "chat" && activeConv?.type === "group" && (
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setTaskOpen(true)}
                title="Assign Task"
              >
                <ListTodo className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground md:hidden"
              onClick={closeWidget}
            >
              <ChevronDown className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground hidden md:flex"
              onClick={closeWidget}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Body - List view */}
          {view === "list" && (
            <div className="absolute inset-0 top-[60px] bg-background overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {listItems.map(item => (
                    <button
                      key={`${item.type}-${item.id}`}
                      onClick={() => openConversation(item)}
                      className="w-full flex items-center gap-3 p-3.5 hover:bg-accent/50 active:bg-accent transition-colors text-left"
                    >
                      {item.type === "group" ? (
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-lg shrink-0">
                          {item.icon || "👥"}
                        </div>
                      ) : (
                        <Avatar className="h-10 w-10 ring-2 ring-primary/10 shrink-0">
                          <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/30 text-primary text-sm font-medium">A</AvatarFallback>
                        </Avatar>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                          {item.unread > 0 && (
                            <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center shrink-0">
                              {item.unread}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {item.type === "group" ? "Group chat" : "Direct message"}
                        </p>
                      </div>
                    </button>
                  ))}
                  {listItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                      <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">No conversations</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Body - Chat view */}
          {view === "chat" && activeConv && (
            <>
              <div className="absolute left-0 right-0 top-[60px] z-10">
                <PinnedMessagesBar
                  pinned={pinnedMessages}
                  onJump={scrollToMessage}
                  onUnpin={handlePinToggle}
                />
              </div>
              <div
                ref={scrollRef}
                className="absolute inset-0 top-[60px] bottom-[72px] px-3 py-3 space-y-3 bg-muted/20 overflow-y-auto"
              >
                {visibleMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">No messages yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Start the conversation
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {visibleMessages.map((msg) => {
                      const replyMsg = msg.reply_to_id
                        ? messages.find(m => m.id === msg.reply_to_id) || null
                        : null;
                      return (
                        <ChatMessageBubble
                          key={msg.id}
                          msg={msg}
                          isMine={msg.sender_id === myId}
                          senderInitial={activeConv.type === "group" ? "U" : "A"}
                          replyToMessage={replyMsg}
                          onReply={setReplyTo}
                          onReaction={addReaction}
                          onDeleteForMe={deleteForMe}
                          onDeleteForEveryone={deleteForEveryone}
                          onScrollToMessage={scrollToMessage}
                          onPinToggle={handlePinToggle}
                          onTaskStatusUpdate={async (msgId, status) => {
                            const { error } = await supabase
                              .from("staff_messages")
                              .update({ task_status: status })
                              .eq("id", msgId);
                            if (error) toast.error("Failed to update task status");
                            else toast.success(`Task marked as ${status}`);
                          }}
                          myId={myId!}
                          isStaff={true}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {replyTo && (
                <div className="absolute bottom-[72px] left-0 right-0 px-3 py-2 border-t border-border/60 bg-muted/50 flex items-center gap-2 z-10">
                  <div className="flex-1 text-xs text-muted-foreground truncate">
                    <span className="text-primary font-medium">Replying to:</span>{" "}
                    {replyTo.message.slice(0, 40)}{replyTo.message.length > 40 ? "..." : ""}
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setReplyTo(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 px-3 py-3 border-t border-border/60 bg-card z-10">
                <form
                  onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                  className="flex gap-2 items-center"
                >
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="text-sm rounded-full h-9 flex-1 bg-muted border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
                  />
                  <Button
                    type="submit" disabled={!newMessage.trim() || uploading}
                    size="icon"
                    className="h-9 w-9 rounded-full shrink-0 bg-primary hover:bg-primary/90"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      )}

      {/* Create Task Card Dialog (group only) */}
      <Dialog open={taskOpen} onOpenChange={(o) => { setTaskOpen(o); if (!o) setShowOrderDropdown(false); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl">
          <div className="px-6 pt-6 pb-2">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="h-5 w-5 text-primary" />
                Create Task Card
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="px-6 pb-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                Subscription Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="e.g., Premium Plan"
                className="h-10 rounded-lg focus-visible:ring-primary/40"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Term
                </Label>
                <Input
                  value={taskTerm}
                  onChange={(e) => setTaskTerm(e.target.value)}
                  placeholder="e.g., 1 Month"
                  className="h-10 rounded-lg"
                />
              </div>
              <div className="space-y-1.5 relative">
                <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5" />
                  Link Order
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={taskOrderId ? `#${taskOrderId.slice(0, 8)}` : orderSearch}
                    onChange={(e) => { setTaskOrderId(null); setOrderSearch(e.target.value); setShowOrderDropdown(true); }}
                    onFocus={() => setShowOrderDropdown(true)}
                    placeholder="Search order..."
                    className="h-10 rounded-lg pl-8"
                  />
                </div>
                {showOrderDropdown && orderResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 max-h-44 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                    {orderResults.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => { setTaskOrderId(o.id); setOrderSearch(""); setShowOrderDropdown(false); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted truncate"
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                Required Info
              </Label>
              <Textarea
                value={taskRequiredInfo}
                onChange={(e) => setTaskRequiredInfo(e.target.value)}
                placeholder="Enter details..."
                className="min-h-[90px] rounded-lg resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTaskOpen(false)}
                className="flex-1 h-11 rounded-lg"
              >
                Cancel
              </Button>
              <Button
                onClick={sendTask}
                disabled={!taskName.trim()}
                className="flex-1 h-11 rounded-lg bg-primary hover:bg-primary/90"
              >
                Create Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FloatingInbox;
