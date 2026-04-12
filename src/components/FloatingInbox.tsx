import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  MessageSquare, Send, Volume2, VolumeX, Paperclip, X, ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatFeatures, playNotificationSound } from "@/hooks/useChatFeatures";
import ChatMessageBubble, { ChatMessage } from "@/components/ChatMessageBubble";
import { toast } from "sonner";

const FloatingInbox = () => {
  const { user } = useAuth();
  const { isStaff, staffInfo } = useStaff();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storeId = staffInfo?.store_id;
  const myId = user?.id;
  const ownerId = staffInfo?.owner_id ?? null;
  const hasStoreContext = !!storeId && !!myId && !!ownerId;

  const { addReaction, deleteForMe, deleteForEveryone, isVisible } = useChatFeatures(myId);

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

  useEffect(() => {
    if (!open || !storeId || !myId || !ownerId) { setMessages([]); return; }
    const load = async () => {
      const { data } = await supabase
        .from("staff_messages")
        .select("*")
        .eq("store_id", storeId)
        .or(`and(sender_id.eq.${myId},receiver_id.eq.${ownerId}),and(sender_id.eq.${ownerId},receiver_id.eq.${myId})`)
        .order("created_at", { ascending: true });
      if (data) setMessages(data as ChatMessage[]);
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

  useEffect(() => {
    if (!storeId || !myId || !ownerId) return;
    const channel = supabase
      .channel(`floating-inbox-${storeId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "staff_messages",
        filter: `store_id=eq.${storeId}`,
      }, (payload) => {
        const msg = payload.new as ChatMessage;
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
          playNotificationSound();
        }
        fetchUnreadCount();
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
  }, [storeId, myId, ownerId, open, soundEnabled, fetchUnreadCount]);

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

  const sendMessage = async () => {
    if (!newMessage.trim() || !storeId || !myId || !ownerId) return;
    const msg = newMessage.trim();
    setNewMessage("");
    const insertData: any = {
      store_id: storeId, sender_id: myId, receiver_id: ownerId,
      message: msg, message_type: "text",
    };
    if (replyTo) insertData.reply_to_id = replyTo.id;
    setReplyTo(null);
    const { error } = await supabase.from("staff_messages").insert(insertData);
    if (error) {
      console.error("Send failed:", error);
      toast.error("Failed to send message");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storeId || !myId || !ownerId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${storeId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("staff-chat").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("staff-chat").getPublicUrl(path);
      const { error } = await supabase.from("staff_messages").insert({
        store_id: storeId, sender_id: myId, receiver_id: ownerId,
        message: file.name, message_type: "file",
        file_url: urlData.publicUrl, file_name: file.name,
      });
      if (error) throw error;
      toast.success("File sent!");
    } catch (err: any) {
      console.error("Upload failed:", err);
      toast.error("Upload failed: " + (err.message || "Unknown error"));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const visibleMessages = messages.filter(m => isVisible(m));

  if (!isStaff || !hasStoreContext) return null;

  return (
    <>
      {/* Floating Chat Button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-4 md:bottom-8 md:right-8 z-50",
          "h-14 w-14 rounded-full",
          "bg-primary text-primary-foreground",
          "flex items-center justify-center",
          "hover:scale-105 active:scale-95 transition-all duration-200",
          "shadow-[0_8px_30px_rgb(0,0,0,0.12)]",
          "ring-2 ring-primary/20 hover:ring-primary/40",
          open && "scale-0 opacity-0"
        )}
      >
        <MessageSquare className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold h-5 min-w-5 flex items-center justify-center rounded-full px-1 shadow-lg">
            {unreadCount}
          </span>
        )}
      </button>

      {/* SaaS-Style Floating Chat Widget */}
      {open && (
        <div
          className={cn(
            "fixed z-50 overflow-hidden",
            // Desktop: Floating card style
            "hidden md:block md:bottom-6 md:right-6",
            "md:w-[360px] md:h-[70vh] md:max-h-[600px]",
            "md:rounded-[20px]",
            "md:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)]",
            "md:border md:border-border/50",
            "bg-background",
            // Mobile: Bottom sheet style
            "md:inset-auto",
            "bottom-0 left-0 right-0",
            "w-full h-[80vh] rounded-t-[20px]",
            "shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.2)]"
          )}
        >
          {/* Header - Fixed */}
          <div className="absolute top-0 left-0 right-0 z-10 px-4 py-3 border-b border-border/60 flex items-center gap-3 bg-card/95 backdrop-blur-sm">
            <Avatar className="h-9 w-9 ring-2 ring-primary/10">
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/30 text-primary text-xs font-medium">A</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">Store Admin</h3>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Online
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground md:hidden"
              onClick={() => setOpen(false)}
            >
              <ChevronDown className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground hidden md:flex"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages - Scrollable */}
          <div 
            ref={scrollRef} 
            className="absolute inset-0 top-[60px] bottom-[72px] overflow-y-auto px-3 py-4 space-y-3 bg-muted/20"
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <span>Loading messages...</span>
              </div>
            ) : visibleMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Start the conversation with your admin</p>
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
                      senderInitial="A"
                      replyToMessage={replyMsg}
                      onReply={setReplyTo}
                      onReaction={addReaction}
                      onDeleteForMe={deleteForMe}
                      onDeleteForEveryone={deleteForEveryone}
                      onScrollToMessage={scrollToMessage}
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

          {/* Reply preview - Fixed above input */}
          {replyTo && (
            <div className="absolute bottom-[72px] left-0 right-0 px-3 py-2 border-t border-border/60 bg-muted/50 flex items-center gap-2 z-10">
              <div className="flex-1 text-xs text-muted-foreground truncate">
                <span className="text-primary font-medium">Replying to:</span>{" "}
                {replyTo.message.slice(0, 40)}{replyTo.message.length > 40 ? "..." : ""}
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive" 
                onClick={() => setReplyTo(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Input - Fixed Bottom */}
          <div className="absolute bottom-0 left-0 right-0 px-3 py-3 border-t border-border/60 bg-card z-10">
            <form 
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }} 
              className="flex gap-2 items-center"
            >
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
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
                type="submit" 
                disabled={!newMessage.trim() || uploading} 
                size="icon" 
                className="h-9 w-9 rounded-full shrink-0 bg-primary hover:bg-primary/90"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingInbox;
