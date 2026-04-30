import { useOfflineChat } from "@/hooks/useOfflineChat";

/** Mounted once at app root: keeps the chat outbox draining on reconnect.
 *  Renders nothing — the per-screen badges show pending counts in context. */
export const OfflineChatDrainer = () => {
  useOfflineChat();
  return null;
};
