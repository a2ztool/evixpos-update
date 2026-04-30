import { useEffect, useState, useCallback } from "react";
import { drainChatOutbox, listPending, subscribeChatOutbox } from "@/lib/offlineChat";
import { toast } from "sonner";

export function useOfflineChat() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setPendingCount((await listPending()).length);
  }, []);

  const sync = useCallback(async (silent = false) => {
    if (syncing || !navigator.onLine) {
      if (!silent && !navigator.onLine) toast.error("You are offline");
      return;
    }
    setSyncing(true);
    try {
      const before = (await listPending()).length;
      if (before === 0) return;
      const { synced, failed } = await drainChatOutbox();
      if (synced > 0 && !silent) toast.success(`Synced ${synced} chat message${synced > 1 ? "s" : ""}`);
      if (failed > 0 && !silent) toast.error(`${failed} chat message failed to sync`);
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [syncing, refresh]);

  useEffect(() => {
    refresh();
    const unsub = subscribeChatOutbox(refresh);
    const onOn = () => { setIsOnline(true); sync(true); };
    const onOff = () => setIsOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    if (navigator.onLine) sync(true);
    return () => {
      unsub();
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, [refresh, sync]);

  return { isOnline, pendingCount, syncing, sync };
}
