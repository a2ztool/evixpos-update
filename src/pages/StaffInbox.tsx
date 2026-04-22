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
import {
  Popover, PopoverContent, PopoverTrigger
} from "@/components/ui/popover";
import { format } from "date-fns";

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
  const [filterTab, setFilterTab] = useState<"chats" | "groups">("chats");
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  // Task fields matching reference design
  const [taskName, setTaskName] = useState("");
  const [taskTerm, setTaskTerm] = useState("");
  const [taskLinkOrder, setTaskLinkOrder] = useState(""); // order id
  const [taskLinkOrderLabel, setTaskLinkOrderLabel] = useState(""); // friendly label
  const [taskRequiredInfo, setTaskRequiredInfo] = useState("");
  const [orderOptions, setOrderOptions] = useState<Array<{ id: string; label: string; sub: string }>>([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("💬");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<{ user_id: string; role: string }[]>([]);
  // Group management
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupIcon, setEditGroupIcon] = useState("💬");
  const [manageMembers, setManageMembers] = useState(false);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(false);
  // Typing indicator
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChatRef = useRef<string | null>(activeChat);
  const activeChatTypeRef = useRef(activeChatType);
  const soundEnabledRef = useRef(soundEnabled);
  const staffListRef = useRef(staffList);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { activeChatTypeRef.current = activeChatType; }, [activeChatType]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { staffListRef.current = staffList; }, [staffList]);

  const storeId = isStaff ? staffInfo?.store_id : activeStore?.id;
  const myId = user?.id;

  const { addReaction, deleteForMe, deleteForEveryone, isVisible } = useChatFeatures(myId);

  // Request desktop notification permission on mount
  useEffect(() => { requestNotifPermission(); }, []);

  // ─── Fetch contacts ───
  // Staff: do NOT fetch other staff. Only the store owner is shown as a direct contact (added via ownerContact).
  // Owner: fetch all staff in this store.
  const fetchContacts = useCallback(async () => {
    if (!storeId || !myId) return;
    setLoading(true);
    if (isStaff) {
      // Staff users only see the owner (added separately) — no global staff directory access.
      setStaffList([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("staff_members")
      .select("id, name, email, role, auth_user_id, is_active")
      .eq("store_id", storeId)
      .eq("is_active", true);
    if (data) setStaffList(data as StaffMember[]);
    setLoading(false);
  }, [storeId, myId, isStaff]);

  const fetchGroups = useCallback(async () => {
    if (!storeId || !myId) return;
    if (isStaff) {
      // Staff: only groups they are a member of
      const { data: memberRows } = await db
        .from("chat_group_members")
        .select("group_id")
        .eq("user_id", myId);
      const groupIds = (memberRows || []).map((r: any) => r.group_id);
      if (groupIds.length === 0) { setGroups([]); return; }
      const { data } = await db
        .from("chat_groups")
        .select("*")
        .eq("store_id", storeId)
        .in("id", groupIds)
        .order("created_at", { ascending: false });
      if (data) setGroups(data);
    } else {
      // Owner: all store groups
      const { data } = await db
        .from("chat_groups")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (data) setGroups(data);
    }
  }, [storeId, myId, isStaff]);

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
      .channel(`staff-inbox-${storeId}-${myId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "staff_messages",
        filter: `store_id=eq.${storeId}`,
      }, (payload) => {
        const msg = payload.new as ChatMessage;
        const ac = activeChatRef.current;
        const act = activeChatTypeRef.current;
        if (act === "direct" && (
          (msg.sender_id === ac && msg.receiver_id === myId) ||
          (msg.sender_id === myId && msg.receiver_id === ac)
        )) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          scrollToBottom();
          if (msg.receiver_id === myId) {
            supabase.from("staff_messages").update({ is_read: true }).eq("id", msg.id).then();
          }
        }
        if (msg.receiver_id === myId && msg.sender_id !== myId) {
          if (soundEnabledRef.current) playNotificationSound();
          const senderStaff = staffListRef.current.find(s => s.auth_user_id === msg.sender_id);
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
  }, [storeId, myId, fetchUnreadCounts]);

  // ─── Realtime group messages (global: all groups I'm a member of) ───
  useEffect(() => {
    if (!storeId || !myId || groups.length === 0) return;
    const groupIds = groups.map(g => g.id);
    const channel = supabase.channel(`group-chats-${myId}-${storeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_group_messages" },
        (payload) => {
          const m = payload.new as any;
          if (!groupIds.includes(m.group_id)) return;
          const ac = activeChatRef.current;
          const act = activeChatTypeRef.current;
          if (act === "group" && ac === m.group_id) {
            const mapped: ChatMessage = {
              id: m.id, store_id: storeId, sender_id: m.sender_id, receiver_id: m.group_id,
              message: m.message, message_type: m.type === "task" ? "task" : m.type === "system" ? "system" : "text",
              file_url: null, file_name: null, task_title: null, task_status: null,
              is_read: true, created_at: m.created_at, reply_to_id: m.reply_to_id || null,
              reactions: m.reactions || null, deleted_for: null, is_deleted_for_everyone: false,
            };
            setMessages(prev => prev.some(msg => msg.id === m.id) ? prev : [...prev, mapped]);
            scrollToBottom();
          }
          if (m.sender_id !== myId) {
            if (soundEnabledRef.current) playNotificationSound();
            const senderName = getSenderNameById(m.sender_id);
            const grp = groups.find(g => g.id === m.group_id);
            sendDesktopNotification(`👥 ${grp?.name || "Group"}`, `${senderName}: ${(m.message || "").slice(0, 80)}`);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, myId, groups]);

  // ─── Realtime: refresh groups when membership or groups change ───
  useEffect(() => {
    if (!storeId || !myId) return;
    const channel = supabase.channel(`group-membership-${myId}-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_group_members" }, () => {
        fetchGroups();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_groups", filter: `store_id=eq.${storeId}` }, () => {
        fetchGroups();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, myId, fetchGroups]);

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
    const replyToId = replyTo?.id ?? null;

    setNewMessage("");
    setReplyTo(null);

    if (activeChatType === "direct") {
      const tempId = `temp-${Date.now()}`;
      const optimisticMessage: ChatMessage = {
        id: tempId,
        store_id: storeId,
        sender_id: myId,
        receiver_id: activeChat,
        message: msg,
        message_type: "text",
        file_url: null,
        file_name: null,
        task_title: null,
        task_status: null,
        is_read: false,
        created_at: new Date().toISOString(),
        reply_to_id: replyToId,
        reactions: null,
        deleted_for: null,
        is_deleted_for_everyone: false,
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      scrollToBottom();

      const insertData: any = {
        store_id: storeId,
        sender_id: myId,
        receiver_id: activeChat,
        message: msg,
        message_type: "text",
      };
      if (replyToId) insertData.reply_to_id = replyToId;

      const { data, error } = await supabase
        .from("staff_messages")
        .insert(insertData)
        .select("*")
        .single();

      if (error) {
        setMessages((prev) => prev.filter((message) => message.id !== tempId));
        setNewMessage(msg);
        if (replyToId) {
          const originalReply = messages.find((message) => message.id === replyToId) ?? null;
          setReplyTo(originalReply);
        }
        toast.error("Failed to send message");
        return;
      }

      setMessages((prev) => {
        const withoutTemp = prev.filter((message) => message.id !== tempId);
        return withoutTemp.some((message) => message.id === data.id)
          ? withoutTemp
          : [...withoutTemp, data as ChatMessage];
      });

      void import("@/lib/notificationTriggers")
        .then(({ notifyStaffMessage }) => notifyStaffMessage(activeChat, "New message", msg))
        .catch(() => undefined);
      return;
    }

    const insertData: any = { group_id: activeChat, sender_id: myId, message: msg, type: "text" };
    if (replyToId) insertData.reply_to_id = replyToId;
    await db.from("chat_group_messages").insert(insertData);
  };

  // ─── Fetch orders for the link-order picker ───
  const fetchOrderOptions = useCallback(async () => {
    if (!storeId) return;
    setLoadingOrders(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("id, total_amount, created_at, status, payment_status, customers(name)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const opts = (data || []).map((o: any) => {
        const shortId = String(o.id).slice(0, 8).toUpperCase();
        const customer = o.customers?.name || "Walk-in";
        const date = o.created_at ? format(new Date(o.created_at), "MMM d") : "";
        return {
          id: o.id,
          label: `#${shortId} • ${customer}`,
          sub: `${date} • ${o.status || "pending"} • ${Number(o.total_amount || 0).toFixed(2)}`,
        };
      });
      setOrderOptions(opts);
    } catch {
      setOrderOptions([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (taskDialogOpen) fetchOrderOptions();
  }, [taskDialogOpen, fetchOrderOptions]);

  // ─── Send task (new fields: name, term, link order, required info) ───
  const sendTask = async () => {
    if (!taskName.trim() || !activeChat || !storeId || !myId) return;
    let fullMessage = `📋 **Task Card**\n\n**Subscription:** ${taskName.trim()}`;
    if (taskTerm) fullMessage += `\n**Term:** ${taskTerm}`;
    if (taskLinkOrder) {
      const label = taskLinkOrderLabel || taskLinkOrder;
      fullMessage += `\n**Linked Order:** ${label}`;
    }
    if (taskRequiredInfo) fullMessage += `\n\n**Required Info:**\n${taskRequiredInfo}`;

    if (activeChatType === "direct") {
      const { error } = await supabase.from("staff_messages").insert({
        store_id: storeId, sender_id: myId, receiver_id: activeChat,
        message: fullMessage, message_type: "task",
        task_title: taskName.trim(), task_status: "pending",
      });
      if (error) { toast.error("Failed to send task"); return; }
      try {
        const { notifyStaffTask } = await import("@/lib/notificationTriggers");
        await notifyStaffTask(activeChat, "Admin", taskName.trim());
      } catch {}
    } else {
      await db.from("chat_group_messages").insert({
        group_id: activeChat, sender_id: myId, message: fullMessage, type: "task"
      });
    }
    toast.success("Task created!");
    setTaskName(""); setTaskTerm(""); setTaskLinkOrder(""); setTaskLinkOrderLabel(""); setTaskRequiredInfo("");
    setOrderSearch("");
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

  // ─── Edit group ───
  const handleEditGroup = async () => {
    if (!editGroupName.trim() || !activeChat) return;
    const { error } = await db.from("chat_groups").update({ name: editGroupName.trim(), icon: editGroupIcon }).eq("id", activeChat);
    if (error) { toast.error("Failed to update group"); return; }
    await db.from("chat_group_messages").insert({ group_id: activeChat, sender_id: myId, message: `Group renamed to "${editGroupName.trim()}"`, type: "system" });
    fetchGroups();
    setEditGroupOpen(false);
    toast.success("Group updated!");
  };

  // ─── Delete group ───
  const handleDeleteGroup = async () => {
    if (!activeChat) return;
    // Delete messages, members, then group
    await db.from("chat_group_messages").delete().eq("group_id", activeChat);
    await db.from("chat_group_members").delete().eq("group_id", activeChat);
    const { error } = await db.from("chat_groups").delete().eq("id", activeChat);
    if (error) { toast.error("Failed to delete group"); return; }
    setActiveChat(null);
    setDeleteGroupConfirm(false);
    fetchGroups();
    toast.success("Group deleted!");
  };

  // ─── Add member to group ───
  const handleAddMember = async (userId: string) => {
    if (!activeChat) return;
    const exists = groupMembers.find(m => m.user_id === userId);
    if (exists) { toast.info("Already a member"); return; }
    const { error } = await db.from("chat_group_members").insert({ group_id: activeChat, user_id: userId, role: "staff" });
    if (error) { toast.error("Failed to add member"); return; }
    const staff = staffList.find(s => s.auth_user_id === userId);
    await db.from("chat_group_messages").insert({ group_id: activeChat, sender_id: myId, message: `${staff?.name || "A member"} was added to the group`, type: "system" });
    setGroupMembers(prev => [...prev, { user_id: userId, role: "staff" }]);
    toast.success(`${staff?.name} added!`);
  };

  // ─── Remove member from group ───
  const handleRemoveMember = async (userId: string) => {
    if (!activeChat || userId === myId) return;
    const { error } = await db.from("chat_group_members").delete().eq("group_id", activeChat).eq("user_id", userId);
    if (error) { toast.error("Failed to remove member"); return; }
    const staff = staffList.find(s => s.auth_user_id === userId);
    await db.from("chat_group_messages").insert({ group_id: activeChat, sender_id: myId, message: `${staff?.name || "A member"} was removed from the group`, type: "system" });
    setGroupMembers(prev => prev.filter(m => m.user_id !== userId));
    toast.success("Member removed!");
  };


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
        {/* Header — hidden on mobile when a chat is open (native app feel) */}
        <div className={cn("flex items-center gap-3 mb-3", showChat && "hidden md:flex")}>
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

        {/* Mobile: full-screen chat (subtract bottom-nav). Desktop: bordered card. */}
        <div className={cn(
          "flex flex-col md:flex-row md:rounded-xl md:border md:border-border overflow-hidden md:bg-card md:shadow-sm",
          // Mobile when chat open: take the full screen (under top bar, above bottom-nav)
          showChat
            ? "fixed inset-x-0 top-14 bottom-16 z-30 bg-background md:static md:inset-auto md:h-[calc(100dvh-12rem)]"
            : "h-[calc(100dvh-12rem)] md:h-[calc(100dvh-12rem)]"
        )}>
          {/* ─── LEFT: Conversation List ─── */}
          <div className={cn("w-full md:w-80 lg:w-96 border-r border-border flex flex-col min-h-0", showChat ? "hidden md:flex" : "flex")}>
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
            <ScrollArea className="flex-1 min-h-0">
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
          <div className={cn("flex-1 flex flex-col min-h-0", !showChat ? "hidden md:flex" : "flex")}>
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
                              <Popover open={orderPickerOpen} onOpenChange={setOrderPickerOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-10 w-full justify-start font-normal text-left truncate"
                                  >
                                    <span className={cn("truncate", !taskLinkOrderLabel && "text-muted-foreground")}>
                                      {taskLinkOrderLabel || "Search order..."}
                                    </span>
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[320px] p-0" align="start">
                                  <div className="p-2 border-b">
                                    <Input
                                      placeholder="Search by ID, customer..."
                                      value={orderSearch}
                                      onChange={(e) => setOrderSearch(e.target.value)}
                                      className="h-8"
                                      autoFocus
                                    />
                                  </div>
                                  <div
                                    className="max-h-64 overflow-y-auto overscroll-contain"
                                    onWheel={(e) => e.stopPropagation()}
                                    onTouchMove={(e) => e.stopPropagation()}
                                  >
                                    {loadingOrders ? (
                                      <div className="p-4 text-xs text-center text-muted-foreground">Loading orders...</div>
                                    ) : (() => {
                                      const q = orderSearch.trim().toLowerCase();
                                      const filtered = q
                                        ? orderOptions.filter(o =>
                                            o.label.toLowerCase().includes(q) ||
                                            o.sub.toLowerCase().includes(q) ||
                                            o.id.toLowerCase().includes(q)
                                          )
                                        : orderOptions;
                                      if (filtered.length === 0) {
                                        return <div className="p-4 text-xs text-center text-muted-foreground">No orders found</div>;
                                      }
                                      return (
                                        <>
                                          {taskLinkOrder && (
                                            <button
                                              type="button"
                                              onClick={() => { setTaskLinkOrder(""); setTaskLinkOrderLabel(""); setOrderPickerOpen(false); }}
                                              className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-accent border-b"
                                            >
                                              Clear selection
                                            </button>
                                          )}
                                          {filtered.map(o => (
                                            <button
                                              key={o.id}
                                              type="button"
                                              onClick={() => {
                                                setTaskLinkOrder(o.id);
                                                setTaskLinkOrderLabel(o.label);
                                                setOrderPickerOpen(false);
                                              }}
                                              className={cn(
                                                "w-full text-left px-3 py-2 hover:bg-accent transition border-b last:border-b-0",
                                                taskLinkOrder === o.id && "bg-primary/10"
                                              )}
                                            >
                                              <div className="text-xs font-medium truncate">{o.label}</div>
                                              <div className="text-[10px] text-muted-foreground truncate">{o.sub}</div>
                                            </button>
                                          ))}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </PopoverContent>
                              </Popover>
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

                  {/* Group management buttons */}
                  {activeChatType === "group" && !isStaff && activeGroupData && (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => {
                            setEditGroupName(activeGroupData.name);
                            setEditGroupIcon(activeGroupData.icon || "💬");
                            setEditGroupOpen(true);
                          }}>
                            <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Group
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setManageMembers(true)}>
                            <UserPlus className="w-3.5 h-3.5 mr-2" /> Manage Members
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteGroupConfirm(true)}>
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Group
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Edit Group Dialog */}
                      <Dialog open={editGroupOpen} onOpenChange={setEditGroupOpen}>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4 text-primary" /> Edit Group</DialogTitle></DialogHeader>
                          <div className="space-y-4 mt-2">
                            <div><Label>Group Name</Label><Input value={editGroupName} onChange={e => setEditGroupName(e.target.value)} /></div>
                            <div>
                              <Label>Icon</Label>
                              <div className="flex gap-2 flex-wrap mt-1">
                                {GROUP_ICONS.map(ic => (
                                  <button key={ic} onClick={() => setEditGroupIcon(ic)}
                                    className={`text-2xl p-1.5 rounded-lg transition-all ${editGroupIcon === ic ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-accent"}`}>
                                    {ic}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <Button onClick={handleEditGroup} className="w-full" disabled={!editGroupName.trim()}>Save Changes</Button>
                          </div>
                        </DialogContent>
                      </Dialog>

                      {/* Manage Members Dialog */}
                      <Dialog open={manageMembers} onOpenChange={setManageMembers}>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Manage Members</DialogTitle></DialogHeader>
                          <div className="space-y-3 mt-2">
                            <div>
                              <Label className="text-xs text-muted-foreground mb-2 block">Current Members ({groupMembers.length})</Label>
                              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                {groupMembers.map(m => {
                                  const staff = staffList.find(s => s.auth_user_id === m.user_id);
                                  const isMe = m.user_id === myId;
                                  return (
                                    <div key={m.user_id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                                      <Avatar className="h-7 w-7">
                                        <AvatarFallback className="text-[10px] bg-accent">{staff ? getInitials(staff.name) : "?"}</AvatarFallback>
                                      </Avatar>
                                      <span className="text-sm flex-1">{staff?.name || (isMe ? "You" : "Unknown")}</span>
                                      <Badge variant="outline" className="text-[10px] capitalize h-4 px-1.5">{m.role}</Badge>
                                      {!isMe && (
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                          onClick={() => handleRemoveMember(m.user_id)}>
                                          <UserMinus className="w-3 h-3" />
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground mb-2 block">Add Members</Label>
                              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                {staffList.filter(s => s.auth_user_id && !groupMembers.find(m => m.user_id === s.auth_user_id)).map(s => (
                                  <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer"
                                    onClick={() => s.auth_user_id && handleAddMember(s.auth_user_id)}>
                                    <Avatar className="h-7 w-7">
                                      <AvatarFallback className="text-[10px] bg-accent">{getInitials(s.name)}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm flex-1">{s.name}</span>
                                    <span className="text-[11px] text-muted-foreground">{s.email}</span>
                                    <UserPlus className="w-3.5 h-3.5 text-primary" />
                                  </div>
                                ))}
                                {staffList.filter(s => s.auth_user_id && !groupMembers.find(m => m.user_id === s.auth_user_id)).length === 0 && (
                                  <p className="text-xs text-muted-foreground text-center py-2">All staff are already members</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      {/* Delete Confirmation */}
                      <AlertDialog open={deleteGroupConfirm} onOpenChange={setDeleteGroupConfirm}>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Group</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{activeGroupData?.name}"? All messages will be permanently deleted. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteGroup} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 min-h-0 px-4 py-4 space-y-3 bg-muted/30 overflow-y-auto">
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
