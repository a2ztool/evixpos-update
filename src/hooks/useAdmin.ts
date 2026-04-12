import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useAdmin = () => {
  const [loading, setLoading] = useState(false);

  const adminCall = useCallback(async (action: string, params?: Record<string, unknown>) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-data", {
        body: { action, params },
      });
      if (error) throw error;
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  return { adminCall, loading };
};
