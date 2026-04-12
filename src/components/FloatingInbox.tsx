import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  MessageSquare, Send, Volume2, VolumeX, Paperclip, X
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col">
          <SheetTitle className="sr-only">Chat with Admin</SheetTitle>
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-card">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-medium">A</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">Store Admin</h3>
                <p className="text-[11px] text-muted-foreground">Owner</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                onClick={() => setSoundEnabled(!soundEnabled)}>
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {loading ? (
                <div className="text-center text-muted-foreground text-sm py-10">Loading...</div>
              ) : visibleMessages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-10">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                visibleMessages.map((msg) => {
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
                      myId={myId!}
                    />
                  );
                })
              )}
            </div>

            {/* Reply preview */}
            {replyTo && (
              <div className="px-3 py-2 border-t border-border bg-muted/50 flex items-center gap-2">
                <div className="flex-1 text-xs text-muted-foreground truncate">
                  Replying to: <span className="font-medium">{replyTo.message.slice(0, 50)}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyTo(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {/* Input */}
            <div className="px-3 py-3 border-t border-border bg-card">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2 items-end">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Paperclip className="w-4 h-4" />
                </Button>
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="text-sm rounded-xl h-10 flex-1"
                />
                <Button type="submit" disabled={!newMessage.trim() || uploading} size="icon" className="h-10 w-10 rounded-xl shrink-0">
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
