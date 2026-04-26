import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ChatMessage } from "@/components/ChatMessageBubble";

/**
 * Returns a pin/unpin toggle for chat messages.
 * Routes group messages to chat_group_messages and direct messages to staff_messages.
 */
export const usePinMessage = (myId: string | undefined) => {
  return useCallback(async (msg: ChatMessage, isGroup: boolean) => {
    if (!myId) return;
    const nextPinned = !msg.is_pinned;
    const table = isGroup ? "chat_group_messages" : "staff_messages";
    const payload: Record<string, any> = {
      is_pinned: nextPinned,
      pinned_at: nextPinned ? new Date().toISOString() : null,
      pinned_by: nextPinned ? myId : null,
    };
    const { error } = await (supabase as any).from(table).update(payload).eq("id", msg.id);
    if (error) {
      console.error("Pin toggle failed:", error);
      toast.error(nextPinned ? "Failed to pin message" : "Failed to unpin message");
    } else {
      toast.success(nextPinned ? "Message pinned" : "Message unpinned");
    }
  }, [myId]);
};
