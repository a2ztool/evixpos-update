import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useAdmin = () => {
  const [loading, setLoading] = useState(false);

  const adminCall = useCallback(async (action: string, params?: Record<string, unknown>) => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Session expired. Please login again.");
        window.location.href = "/sanjoy";
        return null;
      }

      const { data, error } = await supabase.functions.invoke("admin-data", {
        body: { action, params },
      });

      if (error) {
        if (error.message?.includes("Unauthorized") || error.message?.includes("Failed to send")) {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            toast.error("Session expired. Please login again.");
            window.location.href = "/sanjoy";
            return null;
          }

          const { data: retryData, error: retryError } = await supabase.functions.invoke("admin-data", {
            body: { action, params },
          });

          if (retryError) throw retryError;
          return retryData;
        }

        throw error;
      }

      return data;
    } catch (error: any) {
      let message = error?.message || "Admin request failed";

      if (error?.context && typeof error.context.json === "function") {
        try {
          const body = await error.context.json();
          if (body?.error) {
            message = body.error;
          }
        } catch {
          // ignore response parse failures
        }
      }

      toast.error(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { adminCall, loading };
};
