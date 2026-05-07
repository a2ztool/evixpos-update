import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wrench, X } from "lucide-react";

/**
 * Site-wide maintenance banner.
 * Reads from `system_settings` (key=maintenance_mode). Public read is allowed.
 * Listens for realtime changes so admins can flip it instantly.
 */
const MaintenanceBanner = () => {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const fetchSetting = async () => {
      const { data } = await supabase.rpc("get_maintenance_mode");
      if (data) {
        const v = data as any;
        setEnabled(!!v.enabled);
        setMessage(v.message || "");
      }
    };
    fetchSetting();

    const channel = supabase
      .channel("system_settings_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_settings" },
        (payload: any) => {
          const row = payload.new || payload.old;
          if (row?.key === "maintenance_mode") {
            const v = (payload.new?.value || {}) as any;
            setEnabled(!!v.enabled);
            setMessage(v.message || "");
            setDismissed(false);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (!enabled || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
        <Wrench className="h-4 w-4 shrink-0 animate-pulse" />
        <p className="text-sm flex-1 truncate">
          <span className="font-semibold">Maintenance Mode:</span> {message || "We are performing scheduled maintenance."}
        </p>
        <button onClick={() => setDismissed(true)} className="shrink-0 hover:bg-white/20 rounded p-1" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default MaintenanceBanner;
