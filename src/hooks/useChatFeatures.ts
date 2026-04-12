import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useChatFeatures = (myId: string | undefined) => {
  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!myId) return;
    const { data } = await supabase
      .from("staff_messages")
      .select("reactions")
      .eq("id", messageId)
      .single();
    if (!data) return;
    const reactions = (data.reactions as Record<string, string>) || {};
    if (reactions[myId] === emoji) {
      delete reactions[myId];
    } else {
      reactions[myId] = emoji;
    }
    await supabase.from("staff_messages").update({ reactions }).eq("id", messageId);
  }, [myId]);

  const deleteForMe = useCallback(async (messageId: string) => {
    if (!myId) return;
    const { data } = await supabase
      .from("staff_messages")
      .select("deleted_for")
      .eq("id", messageId)
      .single();
    if (!data) return;
    const deletedFor = (data.deleted_for as string[]) || [];
    if (!deletedFor.includes(myId)) {
      deletedFor.push(myId);
    }
    await supabase.from("staff_messages").update({ deleted_for: deletedFor }).eq("id", messageId);
  }, [myId]);

  const deleteForEveryone = useCallback(async (messageId: string, senderId: string) => {
    if (!myId || senderId !== myId) return;
    await supabase.from("staff_messages").update({
      is_deleted_for_everyone: true,
      message: "This message was deleted",
    }).eq("id", messageId);
  }, [myId]);

  const isVisible = useCallback((msg: { deleted_for: string[] | null; is_deleted_for_everyone: boolean | null }) => {
    if (msg.deleted_for && myId && msg.deleted_for.includes(myId)) return false;
    return true;
  }, [myId]);

  return { addReaction, deleteForMe, deleteForEveryone, isVisible };
};

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
