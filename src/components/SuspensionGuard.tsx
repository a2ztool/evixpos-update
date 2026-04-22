import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Global suspension guard.
 * - Watches owner profile (or staff's owner profile) for is_suspended.
 * - Shows a full-screen blocking modal and forces sign-out + redirect.
 * - Works in real-time via Supabase Realtime.
 */
const SuspensionGuard = ({ children }: { children: React.ReactNode }) => {
  const { session } = useAuth();
  const { effectiveUserId, loading: staffLoading } = useStaff();
  const [suspended, setSuspended] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const ownerId = effectiveUserId || session?.user?.id || null;

  useEffect(() => {
    if (!session?.user || staffLoading || !ownerId) return;
    let cancelled = false;

    const check = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_suspended, suspended_reason")
        .eq("id", ownerId)
        .maybeSingle();
      if (!cancelled && data?.is_suspended) {
        setReason(data.suspended_reason ?? null);
        setSuspended(true);
      }
    };
    check();

    const channel = supabase
      .channel(`suspension-guard-${ownerId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${ownerId}` },
        (payload: { new?: { is_suspended?: boolean; suspended_reason?: string | null } }) => {
          if (payload.new?.is_suspended) {
            setReason(payload.new.suspended_reason ?? null);
            setSuspended(true);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, ownerId, staffLoading]);

  useEffect(() => {
    if (!suspended) return;
    // Force sign-out in background; keep modal visible until redirect.
    supabase.auth.signOut().catch(() => {});
  }, [suspended]);

  if (suspended) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-destructive/30 rounded-2xl shadow-2xl p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertOctagon className="w-9 h-9 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Account Suspended</h2>
          <p className="text-muted-foreground text-sm">
            Your account has been suspended by the administrator. You no longer have access to the dashboard.
          </p>
          {reason && (
            <div className="text-left bg-muted/50 rounded-lg p-3 text-sm">
              <div className="font-semibold mb-1">Reason</div>
              <div className="text-muted-foreground whitespace-pre-wrap">{reason}</div>
            </div>
          )}
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => {
              window.location.href = "/auth";
            }}
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default SuspensionGuard;
