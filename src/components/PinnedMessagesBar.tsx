import { Pin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/components/ChatMessageBubble";

interface Props {
  pinned: ChatMessage[];
  onJump: (msgId: string) => void;
  onUnpin: (msg: ChatMessage) => void;
  className?: string;
}

const previewText = (m: ChatMessage) => {
  if (m.is_deleted_for_everyone) return "🚫 Deleted message";
  if (m.message_type === "task" && m.task_title) return `📋 ${m.task_title}`;
  if (m.message_type === "file") return `📎 ${m.file_name || "File"}`;
  return m.message?.slice(0, 80) || "Message";
};

const PinnedMessagesBar = ({ pinned, onJump, onUnpin, className }: Props) => {
  if (!pinned.length) return null;
  return (
    <div className={cn(
      "border-b border-border/60 bg-amber-50 dark:bg-amber-950/20",
      className
    )}>
      <div className="px-3 py-1.5 flex items-center gap-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
        <Pin className="w-3 h-3 fill-current" />
        <span>Pinned ({pinned.length})</span>
      </div>
      <div className="max-h-28 overflow-y-auto divide-y divide-amber-200/50 dark:divide-amber-900/30">
        {pinned.map((m) => (
          <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-amber-100/60 dark:hover:bg-amber-950/40 group">
            <button
              onClick={() => onJump(m.id)}
              className="flex-1 text-left text-xs text-foreground truncate"
              title={previewText(m)}
            >
              {previewText(m)}
            </button>
            <Button
              variant="ghost" size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive shrink-0"
              onClick={() => onUnpin(m)}
              title="Unpin"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PinnedMessagesBar;
