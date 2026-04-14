import { useState, useEffect, useCallback, useRef } from "react";

interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;
  lastOnlineAt: Date | null;
}

export const useNetworkStatus = () => {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    wasOffline: false,
    lastOnlineAt: navigator.onLine ? new Date() : null,
  });
  const queueRef = useRef<Array<() => Promise<void>>>([]);

  const handleOnline = useCallback(() => {
    setStatus((prev) => ({
      isOnline: true,
      wasOffline: true,
      lastOnlineAt: new Date(),
    }));
    // Flush queued actions
    const queue = [...queueRef.current];
    queueRef.current = [];
    queue.forEach((fn) => fn().catch(console.error));
  }, []);

  const handleOffline = useCallback(() => {
    setStatus((prev) => ({ ...prev, isOnline: false }));
  }, []);

  const queueAction = useCallback((fn: () => Promise<void>) => {
    if (navigator.onLine) {
      fn().catch(console.error);
    } else {
      queueRef.current.push(fn);
    }
  }, []);

  const clearWasOffline = useCallback(() => {
    setStatus((prev) => ({ ...prev, wasOffline: false }));
  }, []);

  useEffect(() => {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { ...status, queueAction, clearWasOffline };
};
