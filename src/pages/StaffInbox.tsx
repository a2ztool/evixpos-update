import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { useStore } from "@/contexts/StoreContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import {
  MessageSquare, Send, Search, ArrowLeft, Volume2, VolumeX, Paperclip, X, ListTodo,
  Calendar, Flag, Package, FileText as FileTextIcon, AlertCircle, Plus, Users, Hash,
  Link as LinkIcon, Info, Settings, Trash2, UserPlus, UserMinus, Pencil, MoreVertical
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatFeatures, playNotificationSound } from "@/hooks/useChatFeatures";
import ChatMessageBubble, { ChatMessage } from "@/components/ChatMessageBubble";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

const db = supabase as any;

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  auth_user_id: string | null;
  is_active: boolean;
}

interface ChatGroup {
  id: string;
  store_id: string;
  created_by: string;
  name: string;
  icon: string;
  created_at: string;
}

interface ConversationItem {
  id: string;
  type: "direct" | "group";
  name: string;
  icon?: string;
  role?: string;
  email?: string;
  unread: number;
  lastMessage?: string;
  lastTime?: string;
}

const GROUP_ICONS = ["💬", "👥", "🚀", "📦", "🎯", "⚡", "🔥", "💼", "🏪", "🛒"];

// ─── Desktop push notification helper ───
const sendDesktopNotification = (title: string, body: string) => {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      new window.Notification(title, { body, icon: "/favicon.ico", tag: `msg-${Date.now()}`, silent: true });
    } catch {}
  }
};

const requestNotifPermission = () => {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
};

const StaffInbox = () => {
  const { user } = useAuth();
  const { isStaff, staffInfo } = useStaff();
  const { activeStore } = useStore();

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [activeChatType, setActiveChatType] = useState<"direct" | "group">("direct");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "direct" | "groups">("all");
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  // Task fields matching reference design
  const [taskName, setTaskName] = useState("");
  const [taskTerm, setTaskTerm] = useState("");
  const [taskLinkOrder, setTaskLinkOrder] = useState("");
  const [taskRequiredInfo, setTaskRequiredInfo] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("💬");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<{ user_id: string; role: string }[]>([]);
  // Typing indicator
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storeId = isStaff ? staffInfo?.store_id : activeStore?.id;
  const myId = user?.id;

  const { addReaction, deleteForMe, deleteForEveryone, isVisible } = useChatFeatures(myId);

  // Request desktop notification permission on mount
  useEffect(() => { requestNotifPermission(); }, []);

  // ─── Fetch contacts ───
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
        setStaffList(data.filter(s => s.auth_user_id !== myId) as StaffMember[]);
      } else {
        setStaffList(data as StaffMember[]);
      }
    }
    setLoading(false);
  }, [storeId, myId, isStaff]);

  const fetchGroups = useCallback(async () => {
    if (!storeId) return;
    const { data } = await db.from("chat_groups").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
    if (data) setGroups(data);
  }, [storeId]);

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
    fetchGroups();
    fetchUnreadCounts();
  }, [fetchContacts, fetchGroups, fetchUnreadCounts]);

  // ─── Load messages ───
  useEffect(() => {
    if (!activeChat || !storeId || !myId) { setMessages([]); setReplyTo(null); return; }

    const load = async () => {
      if (activeChatType === "direct") {
        const { data } = await supabase
          .from("staff_messages")
          .select("*")
          .eq("store_id", storeId)
          .or(`and(sender_id.eq.${myId},receiver_id.eq.${activeChat}),and(sender_id.eq.${activeChat},receiver_id.eq.${myId})`)
          .order("created_at", { ascending: true });
        if (data) setMessages(data as ChatMessage[]);
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
      } else {
        const { data } = await db.from("chat_group_messages").select("*").eq("group_id", activeChat).order("created_at", { ascending: true }).limit(200);
        if (data) {
          const mapped: ChatMessage[] = data.map((m: any) => ({
            id: m.id, store_id: storeId, sender_id: m.sender_id, receiver_id: activeChat,
            message: m.message, message_type: m.type === "task" ? "task" : m.type === "system" ? "system" : "text",
            file_url: null, file_name: null,
            task_title: m.type === "task" ? tryParseTaskTitle(m.message) : null,
            task_status: null, is_read: true, created_at: m.created_at,
            reply_to_id: m.reply_to_id || null, reactions: m.reactions || null,
            deleted_for: null, is_deleted_for_everyone: false,
          }));
          setMessages(mapped);
        }
        const { data: membersData } = await db.from("chat_group_members").select("user_id, role").eq("group_id", activeChat);
        if (membersData) setGroupMembers(membersData);
        scrollToBottom();
      }
    };
    load();
  }, [activeChat, activeChatType, storeId, myId, fetchUnreadCounts]);

  // ─── Realtime direct messages ───
  useEffect(() => {
    if (!storeId || !myId) return;
    const channel = supabase
      .channel(`staff-inbox-${storeId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "staff_messages",
        filter: `store_id=eq.${storeId}`,
      }, (payload) => {
        const msg = payload.new as ChatMessage;
        if (activeChatType === "direct" && (
          (msg.sender_id === activeChat && msg.receiver_id === myId) ||
          (msg.sender_id === myId && msg.receiver_id === activeChat)
        )) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          scrollToBottom();
          if (msg.receiver_id === myId) {
            supabase.from("staff_messages").update({ is_read: true }).eq("id", msg.id).then();
          }
        }
        if (msg.receiver_id === myId && msg.sender_id !== myId) {
          if (soundEnabled) playNotificationSound();
          // Desktop push notification
          const senderStaff = staffList.find(s => s.auth_user_id === msg.sender_id);
          const senderName = senderStaff?.name || "Someone";
          sendDesktopNotification(`💬 ${senderName}`, msg.message?.slice(0, 100) || "New message");
        }
        fetchUnreadCounts();
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "staff_messages",
        filter: `store_id=eq.${storeId}`,
      }, (payload) => {
        const updated = payload.new as ChatMessage;
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, myId, activeChat, activeChatType, soundEnabled, fetchUnreadCounts, staffList]);

  // ─── Realtime group messages ───
  useEffect(() => {
    if (!activeChat || activeChatType !== "group") return;
    const channel = supabase.channel(`group-chat-${activeChat}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_group_messages", filter: `group_id=eq.${activeChat}` },
        (payload) => {
          const m = payload.new as any;
          const mapped: ChatMessage = {
            id: m.id, store_id: storeId || "", sender_id: m.sender_id, receiver_id: activeChat,
            message: m.message, message_type: m.type === "task" ? "task" : m.type === "system" ? "system" : "text",
            file_url: null, file_name: null, task_title: null, task_status: null,
            is_read: true, created_at: m.created_at, reply_to_id: m.reply_to_id || null,
            reactions: m.reactions || null, deleted_for: null, is_deleted_for_everyone: false,
          };
          setMessages(prev => prev.some(msg => msg.id === m.id) ? prev : [...prev, mapped]);
          scrollToBottom();
          if (m.sender_id !== myId) {
            if (soundEnabled) playNotificationSound();
            const senderName = getSenderNameById(m.sender_id);
            sendDesktopNotification(`👥 Group Message`, `${senderName}: ${m.message?.slice(0, 80)}`);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeChat, activeChatType, storeId, myId, soundEnabled]);

  // ─── Typing indicator via broadcast ───
  useEffect(() => {
    if (!activeChat || !myId) return;
    const channelName = activeChatType === "direct" ? `typing-${[myId, activeChat].sort().join("-")}` : `typing-group-${activeChat}`;
    const channel = supabase.channel(channelName)
      .on("broadcast", { event: "typing" }, (payload: any) => {
        const { userId, userName } = payload.payload || {};
        if (userId && userId !== myId) {
          setTypingUsers(prev => ({ ...prev, [userId]: userName || "Someone" }));
          // Auto-clear after 3s
          setTimeout(() => {
            setTypingUsers(prev => {
              const next = { ...prev };
              delete next[userId];
              return next;
            });
          }, 3000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); setTypingUsers({}); };
  }, [activeChat, activeChatType, myId]);

  const broadcastTyping = () => {
    if (!activeChat || !myId) return;
    if (typingTimeoutRef.current) return; // debounce
    const channelName = activeChatType === "direct" ? `typing-${[myId, activeChat].sort().join("-")}` : `typing-group-${activeChat}`;
    const myName = isStaff ? (staffInfo?.name || "Staff") : "Admin";
    supabase.channel(channelName).send({ type: "broadcast", event: "typing", payload: { userId: myId, userName: myName } });
    typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 2000);
  };

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

  // ─── Send message ───
  const sendMessage = async () => {
    if (!newMessage.trim() || !activeChat || !storeId || !myId) return;
    const msg = newMessage.trim();
    setNewMessage("");

    if (activeChatType === "direct") {
      const insertData: any = {
        store_id: storeId, sender_id: myId, receiver_id: activeChat,
        message: msg, message_type: "text",
      };
      if (replyTo) insertData.reply_to_id = replyTo.id;
      setReplyTo(null);
      const { error } = await supabase.from("staff_messages").insert(insertData);
      if (error) toast.error("Failed to send message");
    } else {
      const insertData: any = { group_id: activeChat, sender_id: myId, message: msg, type: "text" };
      if (replyTo) insertData.reply_to_id = replyTo.id;
      setReplyTo(null);
      await db.from("chat_group_messages").insert(insertData);
    }
  };

  // ─── Send task (new fields: name, term, link order, required info) ───
  const sendTask = async () => {
    if (!taskName.trim() || !activeChat || !storeId || !myId) return;
    let fullMessage = `📋 **Task Card**\n\n**Subscription:** ${taskName.trim()}`;
    if (taskTerm) fullMessage += `\n**Term:** ${taskTerm}`;
    if (taskLinkOrder) fullMessage += `\n**Linked Order:** ${taskLinkOrder}`;
    if (taskRequiredInfo) fullMessage += `\n\n**Required Info:**\n${taskRequiredInfo}`;

    if (activeChatType === "direct") {
      const { error } = await supabase.from("staff_messages").insert({
        store_id: storeId, sender_id: myId, receiver_id: activeChat,
        message: fullMessage, message_type: "task",
        task_title: taskName.trim(), task_status: "pending",
      });
      if (error) { toast.error("Failed to send task"); return; }
    } else {
      await db.from("chat_group_messages").insert({
        group_id: activeChat, sender_id: myId, message: fullMessage, type: "task"
      });
    }
    toast.success("Task created!");
    setTaskName(""); setTaskTerm(""); setTaskLinkOrder(""); setTaskRequiredInfo("");
    setTaskDialogOpen(false);
  };

  // ─── File upload ───
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat || !storeId || !myId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${storeId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("staff-chat").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("staff-chat").getPublicUrl(path);

      if (activeChatType === "direct") {
        const { error } = await supabase.from("staff_messages").insert({
          store_id: storeId, sender_id: myId, receiver_id: activeChat,
          message: file.name, message_type: "file",
          file_url: urlData.publicUrl, file_name: file.name,
        });
        if (error) throw error;
      } else {
        await db.from("chat_group_messages").insert({
          group_id: activeChat, sender_id: myId,
          message: `📎 [${file.name}](${urlData.publicUrl})`, type: "text"
        });
      }
      toast.success("File sent!");
    } catch (err: any) {
      toast.error("Upload failed: " + (err.message || "Unknown error"));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Create group ───
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !storeId || !myId) return;
    const { data: group, error } = await db.from("chat_groups").insert({
      store_id: storeId, created_by: myId, name: newGroupName.trim(), icon: newGroupIcon
    }).select().single();
    if (error) { toast.error("Failed to create group"); return; }
    await db.from("chat_group_members").insert({ group_id: group.id, user_id: myId, role: "admin" });
    for (const uid of selectedMembers) {
      await db.from("chat_group_members").insert({ group_id: group.id, user_id: uid, role: "staff" });
    }
    await db.from("chat_group_messages").insert({ group_id: group.id, sender_id: myId, message: `Group "${newGroupName}" created`, type: "system" });
    setShowCreateGroup(false); setNewGroupName(""); setSelectedMembers([]); setNewGroupIcon("💬");
    fetchGroups();
    toast.success("Group created!");
  };

  // ─── Build conversation list ───
  const ownerContact = isStaff ? {
    id: "owner", name: "Store Owner", email: "", role: "owner",
    auth_user_id: staffInfo?.owner_id ?? null, is_active: true,
  } : null;

  const allContacts = useMemo(() => {
    const contacts = [...staffList];
    if (ownerContact && !contacts.find(c => c.auth_user_id === ownerContact.auth_user_id)) {
      contacts.unshift(ownerContact as StaffMember);
    }
    return contacts;
  }, [staffList, ownerContact]);

  const conversations = useMemo((): ConversationItem[] => {
    const items: ConversationItem[] = [];
    if (filterTab === "all" || filterTab === "direct") {
      allContacts.forEach(c => {
        if (!c.auth_user_id) return;
        items.push({ id: c.auth_user_id, type: "direct", name: c.name, role: c.role, email: c.email, unread: unreadCounts[c.auth_user_id] || 0 });
      });
    }
    if (filterTab === "all" || filterTab === "groups") {
      groups.forEach(g => {
        items.push({ id: g.id, type: "group", name: g.name, icon: g.icon, unread: 0 });
      });
    }
    if (search) {
      const s = search.toLowerCase();
      return items.filter(i => i.name.toLowerCase().includes(s));
    }
    return items;
  }, [allContacts, groups, unreadCounts, filterTab, search]);

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const activePerson = staffList.find(s => s.auth_user_id === activeChat);
  const activeGroupData = groups.find(g => g.id === activeChat);
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  const getSenderNameById = (senderId: string): string => {
    if (senderId === myId) return "You";
    const staff = staffList.find(s => s.auth_user_id === senderId);
    return staff?.name || "Unknown";
  };

  const showChat = activeChat !== null;
  const visibleMessages = messages.filter(m => isVisible(m));
  const typingList = Object.values(typingUsers);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-2 md:px-4 py-3">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          {showChat && (
            <Button variant="ghost" size="icon" onClick={() => setActiveChat(null)} className="md:hidden h-8 w-8">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Messages</h1>
          {totalUnread > 0 && <Badge className="bg-primary text-primary-foreground text-xs">{totalUnread}</Badge>}
          <div className="ml-auto flex items-center gap-1">
            {!isStaff && (
              <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                    <Plus className="h-3.5 w-3.5" /> New Group
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Create Group</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Group Name</Label><Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. Sales Team" /></div>
                    <div>
                      <Label>Icon</Label>
                      <div className="flex gap-2 flex-wrap mt-1">
                        {GROUP_ICONS.map(ic => (
                          <button key={ic} onClick={() => setNewGroupIcon(ic)}
                            className={`text-2xl p-1.5 rounded-lg transition-all ${newGroupIcon === ic ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-accent"}`}>
                            {ic}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>Add Members</Label>
                      <div className="space-y-2 mt-1 max-h-40 overflow-y-auto">
                        {staffList.map(s => (
                          <label key={s.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer">
                            <input type="checkbox" checked={selectedMembers.includes(s.auth_user_id || "")}
                              onChange={e => {
                                const uid = s.auth_user_id;
                                if (!uid) return;
                                setSelectedMembers(prev => e.target.checked ? [...prev, uid] : prev.filter(id => id !== uid));
                              }}
                              className="rounded" />
                            <span className="text-sm">{s.name}</span>
                            <span className="text-xs text-muted-foreground ml-auto">{s.email}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <Button onClick={handleCreateGroup} className="w-full" disabled={!newGroupName.trim()}>Create Group</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Button variant="ghost" size="icon" onClick={() => setSoundEnabled(!soundEnabled)} className="h-8 w-8 text-muted-foreground">
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex rounded-xl border border-border overflow-hidden bg-card shadow-sm" style={{ height: "calc(100vh - 12rem)" }}>
          {/* ─── LEFT: Conversation List ─── */}
          <div className={cn("w-full md:w-80 lg:w-96 border-r border-border flex flex-col", showChat ? "hidden md:flex" : "flex")}>
            <div className="p-3 border-b border-border space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 text-sm rounded-xl h-9" />
              </div>
              <div className="flex gap-1">
                {(["all", "direct", "groups"] as const).map(tab => (
                  <button key={tab} onClick={() => setFilterTab(tab)}
                    className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize",
                      filterTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            <ScrollArea className="flex-1">
              {loading && conversations.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
              ) : conversations.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No conversations found</p>
                </div>
              ) : (
                conversations.map((conv) => {
                  const isActive = activeChat === conv.id;
                  return (
                    <button key={conv.id} onClick={() => { setActiveChat(conv.id); setActiveChatType(conv.type); }}
                      className={cn(
                        "w-full p-3.5 text-left border-b border-border/50 hover:bg-accent/50 transition-colors",
                        isActive && "bg-primary/5 border-l-2 border-l-primary",
                        conv.unread > 0 && "bg-accent/30"
                      )}>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          {conv.type === "group" ? (
                            <AvatarFallback className="bg-primary/10 text-lg">{conv.icon || "👥"}</AvatarFallback>
                          ) : (
                            <AvatarFallback className={cn("text-xs font-medium",
                              conv.role === "owner" ? "bg-primary/20 text-primary" : "bg-accent text-accent-foreground")}>
                              {getInitials(conv.name)}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={cn("text-sm font-medium truncate", conv.unread > 0 ? "text-foreground" : "text-muted-foreground")}>
                              {conv.name}
                            </span>
                            {conv.unread > 0 && (
                              <Badge className="bg-primary text-primary-foreground text-[10px] h-5 min-w-5 flex items-center justify-center rounded-full">
                                {conv.unread}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {conv.type === "group" ? (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-0.5"><Users className="h-2.5 w-2.5" /> Group</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] capitalize h-4 px-1.5">{conv.role}</Badge>
                            )}
                            {conv.email && <span className="text-[11px] text-muted-foreground truncate">{conv.email}</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </ScrollArea>
          </div>

          {/* ─── RIGHT: Chat Area ─── */}
          <div className={cn("flex-1 flex flex-col", !showChat ? "hidden md:flex" : "flex")}>
            {!activeChat ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="w-16 h-16 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Select a chat to start messaging</p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-card">
                  <Button variant="ghost" size="icon" onClick={() => setActiveChat(null)} className="md:hidden h-8 w-8">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Avatar className="h-9 w-9">
                    {activeChatType === "group" ? (
                      <AvatarFallback className="bg-primary/10 text-lg">{activeGroupData?.icon || "👥"}</AvatarFallback>
                    ) : (
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-medium">
                        {activePerson ? getInitials(activePerson.name).charAt(0) : (ownerContact?.auth_user_id === activeChat ? "SO" : "?")}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      {activeChatType === "group" ? activeGroupData?.name : (activePerson?.name || (ownerContact?.auth_user_id === activeChat ? "Store Owner" : "Unknown"))}
                    </h3>
                    <p className="text-[11px] text-muted-foreground capitalize">
                      {activeChatType === "group" ? `${groupMembers.length} members` : (activePerson?.role || "owner")}
                    </p>
                  </div>
                  {/* Task assign */}
                  {(!isStaff || activeChatType === "group") && (
                    <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-primary/30 hover:bg-primary/10">
                          <ListTodo className="w-3.5 h-3.5" /> Assign Task
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <ListTodo className="w-5 h-5 text-primary" />
                            Create Task Card
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 mt-2">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                              <Package className="w-3 h-3" /> Subscription Name <span className="text-destructive">*</span>
                            </label>
                            <Input placeholder="e.g., Premium Plan" value={taskName} onChange={(e) => setTaskName(e.target.value)} className="h-10" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> Term
                              </label>
                              <Input placeholder="e.g., 1 Month" value={taskTerm} onChange={(e) => setTaskTerm(e.target.value)} className="h-10" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                                <LinkIcon className="w-3 h-3" /> Link Order
                              </label>
                              <Input placeholder="Search order..." value={taskLinkOrder} onChange={(e) => setTaskLinkOrder(e.target.value)} className="h-10" />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                              <Info className="w-3 h-3" /> Required Info
                            </label>
                            <Textarea placeholder="Enter details..." value={taskRequiredInfo} onChange={(e) => setTaskRequiredInfo(e.target.value)} rows={3} className="resize-none" />
                          </div>
                          <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setTaskDialogOpen(false)}>Cancel</Button>
                            <Button onClick={sendTask} disabled={!taskName.trim()} className="flex-1 gap-2 bg-primary hover:bg-primary/90">
                              Create Task
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted/30">
                  {visibleMessages.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-10">No messages yet. Start the conversation!</div>
                  )}
                  {visibleMessages.map((msg) => {
                    if (msg.message_type === "system") {
                      return (
                        <div key={msg.id} className="flex justify-center" id={`msg-${msg.id}`}>
                          <span className="text-xs bg-muted px-3 py-1 rounded-full text-muted-foreground">{msg.message}</span>
                        </div>
                      );
                    }

                    const isMine = msg.sender_id === myId;
                    const senderName = getSenderNameById(msg.sender_id);

                    if (activeChatType === "group") {
                      // Group: show sender name + use ChatMessageBubble for reply/reactions
                      const replyMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) || null : null;
                      return (
                        <div key={msg.id}>
                          {!isMine && (
                            <p className="text-[10px] font-medium text-primary ml-9 mb-0.5">{senderName}</p>
                          )}
                          <ChatMessageBubble
                            msg={msg}
                            isMine={isMine}
                            senderInitial={getInitials(senderName).charAt(0)}
                            replyToMessage={replyMsg}
                            onReply={setReplyTo}
                            onReaction={(msgId, emoji) => {
                              // For group messages, reactions handled differently (local state for now)
                              addReaction(msgId, emoji);
                            }}
                            onDeleteForMe={deleteForMe}
                            onDeleteForEveryone={deleteForEveryone}
                            onScrollToMessage={scrollToMessage}
                            myId={myId!}
                            isStaff={isStaff}
                          />
                        </div>
                      );
                    }

                    // Direct messages
                    const replyMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) || null : null;
                    return (
                      <ChatMessageBubble
                        key={msg.id}
                        msg={msg}
                        isMine={isMine}
                        senderInitial={activePerson ? getInitials(activePerson.name).charAt(0) : "S"}
                        replyToMessage={replyMsg}
                        onReply={setReplyTo}
                        onReaction={addReaction}
                        onDeleteForMe={deleteForMe}
                        onDeleteForEveryone={deleteForEveryone}
                        onScrollToMessage={scrollToMessage}
                        onTaskStatusUpdate={async (msgId, status) => {
                          const { error } = await supabase.from("staff_messages").update({ task_status: status }).eq("id", msgId);
                          if (error) toast.error("Failed to update task status");
                          else toast.success(`Task marked as ${status}`);
                        }}
                        myId={myId!}
                        isStaff={isStaff}
                      />
                    );
                  })}

                  {/* Typing indicator */}
                  {typingList.length > 0 && (
                    <div className="flex items-center gap-2 pl-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      <span className="text-xs text-muted-foreground italic">
                        {typingList.join(", ")} {typingList.length === 1 ? "is" : "are"} typing...
                      </span>
                    </div>
                  )}
                </div>

                {/* Reply preview */}
                {replyTo && (
                  <div className="px-4 py-2 border-t border-border bg-muted/50 flex items-center gap-2">
                    <div className="flex-1 text-xs text-muted-foreground truncate">
                      Replying to: <span className="font-medium">{replyTo.message.slice(0, 60)}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyTo(null)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                )}

                {/* Input */}
                <div className="px-4 py-3 border-t border-border bg-card">
                  <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2 items-end">
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground"
                      onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      <Paperclip className="w-4 h-4" />
                    </Button>
                    <Input value={newMessage} onChange={(e) => { setNewMessage(e.target.value); broadcastTyping(); }}
                      placeholder="Type a message..." className="text-sm rounded-xl h-10 flex-1" />
                    <Button type="submit" disabled={!newMessage.trim() || uploading} size="icon" className="h-10 w-10 rounded-xl shrink-0">
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

function tryParseTaskTitle(msg: string): string | null {
  try {
    const parsed = JSON.parse(msg);
    return parsed.title || null;
  } catch {
    if (msg.includes("**Subscription:**")) {
      const match = msg.match(/\*\*Subscription:\*\*\s*(.+)/);
      return match?.[1] || null;
    }
    if (msg.includes("**Title:**")) {
      const match = msg.match(/\*\*Title:\*\*\s*(.+)/);
      return match?.[1] || null;
    }
    return null;
  }
}

export default StaffInbox;
