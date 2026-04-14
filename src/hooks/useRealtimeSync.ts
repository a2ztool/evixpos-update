import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type TableName = string;
type RealtimeCallback = () => void;

interface RealtimeConfig {
  /** Supabase table name */
  table: TableName;
  /** Filter expression, e.g. "store_id=eq.abc123" */
  filter?: string;
  /** Events to listen for */
  events?: ("INSERT" | "UPDATE" | "DELETE")[];
}

/**
 * Subscribe to multiple Supabase Realtime postgres_changes channels.
 * Calls `onUpdate` whenever any watched table changes.
 * Handles cleanup and StrictMode double-mount safely.
 * 
 * @param channelKey Unique key for the channel (include store_id)
 * @param tables Array of table configs to watch
 * @param onUpdate Callback to invoke on any change
 * @param enabled Whether subscriptions are active
 */
export const useRealtimeSync = (
  channelKey: string,
  tables: RealtimeConfig[],
  onUpdate: RealtimeCallback,
  enabled = true
) => {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !channelKey || tables.length === 0) return;

    // Prevent double-mount in StrictMode
    if (mountedRef.current && channelRef.current) return;
    mountedRef.current = true;

    const uniqueKey = `${channelKey}-${Date.now()}`;
    const channel = supabase.channel(uniqueKey);

    tables.forEach(({ table, filter, events }) => {
      const eventList = events || ["*"];
      eventList.forEach(event => {
        const config: any = {
          event: event === "*" ? "*" : event,
          schema: "public",
          table,
        };
        if (filter) config.filter = filter;
        channel.on("postgres_changes", config, () => {
          onUpdate();
        });
      });
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      mountedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [channelKey, enabled]); // Intentionally exclude onUpdate/tables to avoid re-subscribing
};
