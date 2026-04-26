import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export interface MentionUser {
  id: string;          // auth user id
  name: string;
  role?: string;
}

interface Props {
  open: boolean;
  query: string;
  users: MentionUser[];
  onSelect: (u: MentionUser) => void;
  onClose: () => void;
  /** Optional anchor classname; positioned absolutely above input */
  className?: string;
}

const initials = (name: string) =>
  name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

const MentionPicker = ({ open, query, users, onSelect, onClose, className }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;
  const q = query.toLowerCase().trim();
  const filtered = q
    ? users.filter(u => u.name.toLowerCase().includes(q))
    : users;

  if (filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute bottom-full left-0 right-0 mb-2 z-30 max-h-52 overflow-y-auto",
        "bg-popover border border-border rounded-xl shadow-lg p-1",
        className
      )}
    >
      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        Mention a member
      </div>
      {filtered.slice(0, 8).map((u) => (
        <button
          key={u.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onSelect(u); }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent text-left transition-colors"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-medium">
              {initials(u.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{u.name}</div>
            {u.role && <div className="text-[10px] text-muted-foreground capitalize">{u.role}</div>}
          </div>
        </button>
      ))}
    </div>
  );
};

export default MentionPicker;
