import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useAdmin = () => {
  const [loading, setLoading] = useState(false);

  const adminCall = useCallback(async (action: string, params?: Record<string, unknown>) => {
    setLoading(true);
    try {
      // Ensure we have a valid session before calling
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Session expired. Please login again.");
window.location.href = "/sanjoy";
        return null;
      }

      const { data, error } = await supabase.functions.invoke("admin-data", {
        body: { action, params },
      });
      if (error) {
        // Check if it's an auth error
        if (error.message?.includes("Unauthorized") || error.message?.includes("Failed to send")) {
          // Try refreshing session
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            toast.error("Session expired. Please login again.");
            window.location.href = "/sanjoy";
            return null;
          }
          // Retry once after refresh
          const { data: retryData, error: retryError } = await supabase.functions.invoke("admin-data", {
            body: { action, params },
          });
          if (retryError) throw retryError;
          return retryData;
        }
        throw error;
      }
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  return { adminCall, loading };
};
