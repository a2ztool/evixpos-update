import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ContentItem {
  key: string;
  value: string;
  section: string;
  content_type: string;
}

export const useLandingContent = () => {
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchContent = useCallback(async () => {
    const { data } = await supabase
      .from("landing_content")
      .select("key, value, section, content_type")
      .order("sort_order");
    const map: Record<string, string> = {};
    ((data as ContentItem[]) || []).forEach((item) => {
      map[item.key] = item.value;
    });
    setContent(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchContent();

    // Realtime subscription for instant admin updates
    const channel = supabase
      .channel("landing_content_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "landing_content" },
        () => {
          fetchContent();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchContent]);

  const get = useCallback(
    (key: string, fallback = "") => content[key] || fallback,
    [content]
  );

  return { content, get, loading };
};
