import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Send, Reply, MessageCircle, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday } from "date-fns";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notificationSound";

const db = supabase as any;

interface TaskComment {
  id: string;
  task_message_id: string;
  group_id: string;
  parent_comment_id: string | null;
  sender_id: string;
  message: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskMessageId: string;
  groupId: string;
  taskTitle: string;
  myId: string;
  resolveName: (userId: string) => string;
}

const initials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
const fmt = (s: string) => {
  const d = new Date(s);
  return isToday(d) ? format(d, "h:mm a") : format(d, "MMM d, h:mm a");
};

const TaskCommentsThread = ({
  open, onOpenChange, taskMessageId, groupId, taskTitle, myId, resolveName,
}: Props) => {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<TaskComment | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBottom = useCallback(() => {
    setTimeout(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 60);
  }, []);

  // Fetch comments
  useEffect(() => {
    if (!open || !taskMessageId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await db
        .from("chat_task_comments")
        .select("*")
        .eq("task_message_id", taskMessageId)
        .order("created_at", { ascending: true });
      if (!cancelled && !error && data) {
        setComments(data as TaskComment[]);
        scrollBottom();
      }
    })();
    return () => { cancelled = true; };
  }, [open, taskMessageId, scrollBottom]);

  // Realtime
  useEffect(() => {
    if (!open || !taskMessageId) return;
    const channel = supabase
      .channel(`task-comments-${taskMessageId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_task_comments", filter: `task_message_id=eq.${taskMessageId}` },
        (payload) => {
          const c = payload.new as TaskComment;
          setComments((prev) => prev.some((x) => x.id === c.id) ? prev : [...prev, c]);
          scrollBottom();
          if (c.sender_id !== myId) {
            playNotificationSound("message");
          }
        })
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_task_comments", filter: `task_message_id=eq.${taskMessageId}` },
        (payload) => {
          const old = payload.old as { id: string };
          setComments((prev) => prev.filter((x) => x.id !== old.id));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, taskMessageId, scrollBottom]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    const payload = {
      task_message_id: taskMessageId,
      group_id: groupId,
      parent_comment_id: replyTo?.id ?? null,
      sender_id: myId,
      message: msg,
    };
    const { error } = await db.from("chat_task_comments").insert(payload);
    setSending(false);
    if (error) {
      toast.error("Failed to post comment");
      return;
    }
    setText("");
    setReplyTo(null);
  };

  const remove = async (id: string) => {
    const { error } = await db.from("chat_task_comments").delete().eq("id", id);
    if (error) toast.error("Failed to delete comment");
  };

  // Build map: parent_id → children, plus root list
  const byParent = new Map<string | null, TaskComment[]>();
  for (const c of comments) {
    const k = c.parent_comment_id;
    const arr = byParent.get(k) || [];
    arr.push(c);
    byParent.set(k, arr);
  }
  const roots = byParent.get(null) || [];

  const renderComment = (c: TaskComment, depth = 0) => {
    const children = byParent.get(c.id) || [];
    const mine = c.sender_id === myId;
    const name = resolveName(c.sender_id);
    return (
      <div key={c.id} className={cn("space-y-2", depth > 0 && "ml-7 pl-3 border-l-2 border-border/60")}>
        <div className="flex gap-2 group/comment">
          <Avatar className="h-7 w-7 shrink-0 mt-0.5">
            <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-medium">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">{mine ? "You" : name}</span>
              <span className="text-[10px] text-muted-foreground">{fmt(c.created_at)}</span>
            </div>
            <div
              className="text-sm text-foreground whitespace-pre-wrap break-words mt-0.5 select-text"
              style={{ userSelect: "text", WebkitUserSelect: "text" }}
            >
              {c.message}
            </div>
            <div className="flex items-center gap-2 mt-1 opacity-0 group-hover/comment:opacity-100 transition-opacity">
              <button
                onClick={() => setReplyTo(c)}
                className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
              >
                <Reply className="h-3 w-3" /> Reply
              </button>
              {mine && (
                <button
                  onClick={() => remove(c.id)}
                  className="text-[10px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
        {children.length > 0 && (
          <div className="space-y-2">{children.map((ch) => renderComment(ch, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4 text-primary" />
            Comments
          </SheetTitle>
          <p className="text-xs text-muted-foreground truncate text-left">on “{taskTitle}”</p>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div ref={scrollRef} className="p-4 space-y-4">
            {roots.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8">
                No comments yet. Start the discussion!
              </div>
            ) : (
              roots.map((c) => renderComment(c))
            )}
          </div>
        </ScrollArea>

        {replyTo && (
          <div className="px-3 py-2 border-t border-border bg-muted/40 flex items-center gap-2">
            <div className="flex-1 text-[11px] text-muted-foreground truncate">
              Replying to <span className="font-medium text-foreground">{resolveName(replyTo.sender_id)}</span>:{" "}
              {replyTo.message.slice(0, 60)}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyTo(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="px-3 py-3 border-t border-border bg-card flex gap-2"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={replyTo ? "Write a reply..." : "Write a comment..."}
            className="text-sm rounded-xl h-10 flex-1"
          />
          <Button type="submit" disabled={!text.trim() || sending} size="icon" className="h-10 w-10 rounded-xl shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
};

export default TaskCommentsThread;
