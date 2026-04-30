import { useEffect, useState, useCallback, useRef } from "react";
import { drainOutbox, listPendingSales, subscribeOutboxChange } from "@/lib/offlinePOS";
import { toast } from "sonner";

export function useOfflinePOS(opts?: { onSynced?: () => void }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const onSyncedRef = useRef(opts?.onSynced);
  onSyncedRef.current = opts?.onSynced;

  const refreshCount = useCallback(async () => {
    const list = await listPendingSales();
    setPendingCount(list.length);
  }, []);

  const sync = useCallback(async (silent = false) => {
    if (syncing) return;
    if (!navigator.onLine) {
      if (!silent) toast.error("You are offline");
      return;
    }
    setSyncing(true);
    try {
      const before = (await listPendingSales()).length;
      if (before === 0) {
        if (!silent) toast.success("Nothing to sync");
        return;
      }
      const { synced, failed } = await drainOutbox();
      if (synced > 0) {
        toast.success(`Synced ${synced} offline sale${synced > 1 ? "s" : ""}`);
        onSyncedRef.current?.();
      }
      if (failed > 0) toast.error(`${failed} sale failed to sync — will retry`);
    } finally {
      setSyncing(false);
      refreshCount();
    }
  }, [syncing, refreshCount]);

  useEffect(() => {
    refreshCount();
    const unsub = subscribeOutboxChange(refreshCount);
    const onOn = () => { setIsOnline(true); sync(true); };
    const onOff = () => setIsOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    // initial drain attempt
    if (navigator.onLine) sync(true);
    return () => {
      unsub();
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, [refreshCount, sync]);

  return { isOnline, pendingCount, syncing, sync, refreshCount };
}
