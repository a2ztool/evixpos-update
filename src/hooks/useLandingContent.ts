import { useState, useEffect } from "react";
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

  useEffect(() => {
    supabase
      .from("landing_content")
      .select("key, value, section, content_type")
      .order("sort_order")
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data as ContentItem[] || []).forEach((item) => {
          map[item.key] = item.value;
        });
        setContent(map);
        setLoading(false);
      });
  }, []);

  const get = (key: string, fallback = "") => content[key] || fallback;

  return { content, get, loading };
};
