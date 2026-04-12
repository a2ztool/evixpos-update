import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  MessageSquare, Send, Check, CheckCheck,
  Volume2, VolumeX
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";

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

const notificationSound = typeof Audio !== "undefined"
  ? new Audio("data:audio/wav;base64,UklGRl9vT19teleXhBVkUgT09PUABAAAABAAEARKwAAIhYAQACABAAZGF0YQoAAAD//wIA")
  : null;

const FloatingInbox = () => {
  const { user } = useAuth();
  const { isStaff, staffInfo } = useStaff();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const storeId = staffInfo?.store_id;
  const myId = user?.id;
  const ownerId = staffInfo?.owner_id ?? null;

  const hasStoreContext = !!storeId && !!myId && !!ownerId;

  const fetchUnreadCount = useCallback(async () => {
    if (!storeId || !myId || !ownerId) return;
    const { data } = await supabase
      .from("staff_messages")
      .select("id")
      .eq("store_id", storeId)
      .eq("sender_id", ownerId)
      .eq("receiver_id", myId)
      .eq("is_read", false);
    setUnreadCount(data?.length ?? 0);
  }, [storeId, myId, ownerId]);

  useEffect(() => {
    if (hasStoreContext) {
      fetchUnreadCount();
      setLoading(false);
    }
  }, [hasStoreContext, fetchUnreadCount]);

  // Load messages when opened
  useEffect(() => {
    if (!open || !storeId || !myId || !ownerId) { setMessages([]); return; }
    const load = async () => {
      const { data } = await supabase
        .from("staff_messages")
        .select("*")
        .eq("store_id", storeId)
        .or(`and(sender_id.eq.${myId},receiver_id.eq.${ownerId}),and(sender_id.eq.${ownerId},receiver_id.eq.${myId})`)
        .order("created_at", { ascending: true });
      if (data) setMessages(data as StaffMessage[]);
      scrollToBottom();
      await supabase
        .from("staff_messages")
        .update({ is_read: true })
        .eq("store_id", storeId)
        .eq("sender_id", ownerId)
        .eq("receiver_id", myId)
        .eq("is_read", false);
      fetchUnreadCount();
    };
    load();
  }, [open, storeId, myId, ownerId, fetchUnreadCount]);

  // Real-time subscription
  useEffect(() => {
    if (!storeId || !myId || !ownerId) return;
    const channel = supabase
      .channel(`floating-inbox-${storeId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "staff_messages",
        filter: `store_id=eq.${storeId}`,
      }, (payload) => {
        const msg = payload.new as StaffMessage;
        const isRelevant =
          (msg.sender_id === ownerId && msg.receiver_id === myId) ||
          (msg.sender_id === myId && msg.receiver_id === ownerId);
        if (!isRelevant) return;

        if (open) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          scrollToBottom();
          if (msg.receiver_id === myId) {
            supabase.from("staff_messages").update({ is_read: true }).eq("id", msg.id).then();
          }
        }
        if (msg.receiver_id === myId && msg.sender_id !== myId && soundEnabled) {
          notificationSound?.play().catch(() => {});
        }
        fetchUnreadCount();
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
  }, [storeId, myId, ownerId, open, soundEnabled, fetchUnreadCount]);

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 80);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !storeId || !myId || !ownerId) return;
    const msg = newMessage.trim();
    setNewMessage("");
    await supabase.from("staff_messages").insert({
      store_id: storeId,
      sender_id: myId,
      receiver_id: ownerId,
      message: msg,
      message_type: "text",
    });
  };

  const formatMsgTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return format(d, "h:mm a");
    if (isYesterday(d)) return "Yesterday " + format(d, "h:mm a");
    return format(d, "MMM d, h:mm a");
  };

  // Only show for staff users
  if (!isStaff) return null;
  if (!hasStoreContext) return null;

  return (
    <>
      {/* Floating button — bottom-right */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50",
          "h-14 w-14 rounded-full shadow-lg",
          "bg-primary text-primary-foreground",
          "flex items-center justify-center",
          "hover:scale-105 active:scale-95 transition-transform",
          "ring-2 ring-primary/20"
        )}
      >
        <MessageSquare className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold h-5 min-w-5 flex items-center justify-center rounded-full px-1">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Chat Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[420px] p-0 flex flex-col"
        >
          <SheetTitle className="sr-only">Chat with Admin</SheetTitle>

          <div className="flex flex-col h-full">
            {/* Chat Header */}
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-medium">
                  A
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">
                  Store Admin
                </h3>
                <p className="text-[11px] text-muted-foreground">Owner</p>
              </div>
              <Button
                variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                onClick={() => setSoundEnabled(!soundEnabled)}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {loading ? (
                <div className="text-center text-muted-foreground text-sm py-10">Loading...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-10">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.sender_id === myId;
                  return (
                    <div key={msg.id} className={cn("flex gap-2", isMine ? "justify-end" : "")}>
                      {!isMine && (
                        <Avatar className="h-6 w-6 shrink-0 mt-1">
                          <AvatarFallback className="bg-accent text-accent-foreground text-[10px]">
                            A
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className={cn(
                        "rounded-2xl px-3 py-2 text-sm max-w-[80%]",
                        isMine
                          ? "bg-primary text-primary-foreground rounded-tr-md"
                          : "bg-accent text-accent-foreground rounded-tl-md"
                      )}>
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
                })
              )}
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-border">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="text-sm rounded-xl h-10 flex-1"
                />
                <Button type="submit" disabled={!newMessage.trim()} size="icon" className="h-10 w-10 rounded-xl">
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default FloatingInbox;
