import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check, CheckCheck, FileText, ListTodo, Reply, Trash2, Smile,
  MoreVertical, Download
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { REACTION_EMOJIS } from "@/hooks/useChatFeatures";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger
} from "@/components/ui/popover";

export interface ChatMessage {
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
  reply_to_id: string | null;
  reactions: Record<string, string> | null;
  deleted_for: string[] | null;
  is_deleted_for_everyone: boolean | null;
}

interface Props {
  msg: ChatMessage;
  isMine: boolean;
  senderInitial: string;
  replyToMessage?: ChatMessage | null;
  onReply: (msg: ChatMessage) => void;
  onReaction: (msgId: string, emoji: string) => void;
  onDeleteForMe: (msgId: string) => void;
  onDeleteForEveryone: (msgId: string, senderId: string) => void;
  onScrollToMessage?: (msgId: string) => void;
  myId: string;
}

const formatMsgTime = (dateStr: string) => {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday " + format(d, "h:mm a");
  return format(d, "MMM d, h:mm a");
};

const ChatMessageBubble = ({
  msg, isMine, senderInitial, replyToMessage,
  onReply, onReaction, onDeleteForMe, onDeleteForEveryone,
  onScrollToMessage, myId
}: Props) => {
  const [showActions, setShowActions] = useState(false);
  const reactions = msg.reactions || {};
  const reactionEntries = Object.entries(reactions);
  const reactionCounts: Record<string, number> = {};
  reactionEntries.forEach(([, emoji]) => {
    reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
  });

  const isDeleted = msg.is_deleted_for_everyone;

  return (
    <div
      id={`msg-${msg.id}`}
      className={cn("flex gap-2 group relative", isMine ? "justify-end" : "")}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {!isMine && (
        <Avatar className="h-7 w-7 shrink-0 mt-1">
          <AvatarFallback className="bg-accent text-accent-foreground text-[10px] font-medium">
            {senderInitial}
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex flex-col max-w-[80%] md:max-w-[70%]">
        {/* Reply preview */}
        {replyToMessage && !isDeleted && (
          <button
            onClick={() => onScrollToMessage?.(replyToMessage.id)}
            className={cn(
              "text-[11px] px-3 py-1.5 rounded-t-xl border-l-2 mb-[-4px] text-left truncate",
              isMine
                ? "bg-primary/20 text-primary-foreground/80 border-primary-foreground/40 self-end"
                : "bg-muted text-muted-foreground border-primary/40"
            )}
          >
            <span className="font-medium flex items-center gap-1">
              <Reply className="w-3 h-3" />
              {replyToMessage.message.slice(0, 60)}{replyToMessage.message.length > 60 ? "..." : ""}
            </span>
          </button>
        )}

        <div className={cn(
          "rounded-2xl px-3.5 py-2.5 text-sm relative",
          isMine
            ? "bg-primary text-primary-foreground rounded-tr-md"
            : "bg-accent text-accent-foreground rounded-tl-md",
          isDeleted && "italic opacity-60"
        )}>
          {/* Action buttons */}
          {showActions && !isDeleted && (
            <div className={cn(
              "absolute top-0 flex items-center gap-0.5 z-10",
              isMine ? "-left-20" : "-right-20"
            )}>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                    <Smile className="w-3.5 h-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1.5 flex gap-1" side="top">
                  {REACTION_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => onReaction(msg.id, emoji)}
                      className={cn(
                        "text-lg hover:scale-125 transition-transform px-1 rounded",
                        reactions[myId] === emoji && "bg-primary/20"
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => onReply(msg)}>
                <Reply className="w-3.5 h-3.5" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isMine ? "end" : "start"} className="w-44">
                  <DropdownMenuItem onClick={() => onDeleteForMe(msg.id)}>
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete for me
                  </DropdownMenuItem>
                  {isMine && (
                    <DropdownMenuItem onClick={() => onDeleteForEveryone(msg.id, msg.sender_id)}
                      className="text-destructive">
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete for everyone
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Task message */}
          {msg.message_type === "task" && msg.task_title && !isDeleted && (
            <div className="flex items-center gap-1.5 mb-1.5 text-xs opacity-80">
              <ListTodo className="w-3 h-3" />
              <span className="font-medium">Task: {msg.task_title}</span>
              <Badge variant="outline" className="text-[9px] h-4 capitalize">{msg.task_status}</Badge>
            </div>
          )}

          {/* File message */}
          {msg.message_type === "file" && msg.file_url && !isDeleted && (
            <div className="mb-2">
              {msg.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img src={msg.file_url} alt={msg.file_name || "image"} className="rounded-lg max-w-full max-h-48 object-cover" />
              ) : (
                <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg bg-background/20 hover:bg-background/30 transition">
                  <FileText className="w-5 h-5 shrink-0" />
                  <span className="text-xs truncate flex-1">{msg.file_name || "File"}</span>
                  <Download className="w-4 h-4 shrink-0" />
                </a>
              )}
            </div>
          )}

          <p className="whitespace-pre-wrap break-words">
            {isDeleted ? "🚫 This message was deleted" : msg.message}
          </p>

          <div className={cn(
            "text-[10px] mt-1 flex items-center gap-1",
            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {formatMsgTime(msg.created_at)}
            {isMine && (msg.is_read
              ? <CheckCheck className="w-3 h-3" />
              : <Check className="w-3 h-3" />
            )}
          </div>
        </div>

        {/* Reactions display */}
        {Object.keys(reactionCounts).length > 0 && (
          <div className={cn("flex gap-1 mt-0.5 flex-wrap", isMine ? "justify-end" : "")}>
            {Object.entries(reactionCounts).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReaction(msg.id, emoji)}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full border bg-background hover:bg-accent transition",
                  reactions[myId] === emoji && "border-primary bg-primary/10"
                )}
              >
                {emoji} {count > 1 && count}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessageBubble;
