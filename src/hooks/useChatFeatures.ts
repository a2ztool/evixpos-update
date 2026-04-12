import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
    const currentDeletedFor = (data.deleted_for as string[]) || [];
    if (!currentDeletedFor.includes(myId)) {
      currentDeletedFor.push(myId);
    }
    const { error } = await supabase
      .from("staff_messages")
      .update({ deleted_for: currentDeletedFor })
      .eq("id", messageId);
    if (error) {
      console.error("Delete for me failed:", error);
      toast.error("Failed to delete message");
    }
  }, [myId]);

  const deleteForEveryone = useCallback(async (messageId: string, senderId: string) => {
    if (!myId || senderId !== myId) return;
    const { error } = await supabase.from("staff_messages").update({
      is_deleted_for_everyone: true,
      message: "This message was deleted",
    }).eq("id", messageId);
    if (error) {
      console.error("Delete for everyone failed:", error);
      toast.error("Failed to delete message");
    }
  }, [myId]);

  const isVisible = useCallback((msg: { deleted_for: string[] | null; is_deleted_for_everyone: boolean | null }) => {
    if (msg.deleted_for && myId && (msg.deleted_for as string[]).includes(myId)) return false;
    return true;
  }, [myId]);

  return { addReaction, deleteForMe, deleteForEveryone, isVisible };
};

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

// Notification sound utility - a proper short notification beep
let notifAudioCtx: AudioContext | null = null;
export const playNotificationSound = () => {
  try {
    if (!notifAudioCtx) {
      notifAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = notifAudioCtx;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // Audio not supported
  }
};
