import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Single-session enforcement for store owners only.
  // Staff users (rows in staff_members) are exempt — they may stay logged in on multiple devices.
  useEffect(() => {
    if (!session?.user) return;
    const uid = session.user.id;
    const sessionId = `${uid}-${session.access_token.slice(-24)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      // Skip session control for staff
      const { data: staffRow } = await supabase
        .from("staff_members")
        .select("id")
        .eq("auth_user_id", uid)
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled) return;
      if (staffRow) return; // staff: multi-device allowed

      // Invalidate any prior active sessions for this owner
      await supabase
        .from("active_sessions")
        .update({ is_active: false, invalidated_reason: "replaced_by_new_login" })
        .eq("user_id", uid)
        .eq("is_active", true)
        .neq("session_id", sessionId);

      // Register current session
      await supabase.from("active_sessions").upsert(
        {
          user_id: uid,
          session_id: sessionId,
          device_label: typeof navigator !== "undefined" ? navigator.platform : "",
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "",
          is_active: true,
          last_active_at: new Date().toISOString(),
        },
        { onConflict: "session_id" },
      );

      // Listen for invalidation of THIS session by a newer login
      channel = supabase
        .channel(`active-session-${sessionId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "active_sessions", filter: `user_id=eq.${uid}` },
          (payload: { new?: { session_id?: string; is_active?: boolean } }) => {
            if (
              payload.new?.session_id === sessionId &&
              payload.new?.is_active === false
            ) {
              toast.error("You have been logged out because you logged in from another device.");
              supabase.auth.signOut().finally(() => {
                if (typeof window !== "undefined") window.location.href = "/auth";
              });
            }
          },
        )
        .subscribe();
    };

    setup();

    // Heartbeat — keeps last_active_at fresh
    const heartbeat = setInterval(() => {
      supabase
        .from("active_sessions")
        .update({ last_active_at: new Date().toISOString() })
        .eq("session_id", sessionId)
        .then(() => {});
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      if (channel) supabase.removeChannel(channel);
    };
  }, [session?.user?.id, session?.access_token]);

  // Suspension enforcement: check own profile and (if staff) owner profile.
  // Force sign-out if suspended and listen to realtime changes.
  useEffect(() => {
    if (!session?.user) return;
    const uid = session.user.id;
    let cancelled = false;

    const enforce = async () => {
      // Resolve owner id if this user is staff
      const { data: staffRow } = await supabase
        .from("staff_members")
        .select("user_id")
        .eq("auth_user_id", uid)
        .eq("is_active", true)
        .maybeSingle();
      const ownerId = staffRow?.user_id || uid;

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_suspended")
        .eq("id", ownerId)
        .maybeSingle();

      if (!cancelled && profile?.is_suspended) {
        toast.error("Your account has been suspended by admin.");
        await supabase.auth.signOut();
        if (typeof window !== "undefined") {
          window.location.href = "/auth";
        }
      }
      return ownerId;
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    enforce().then((ownerId) => {
      if (cancelled || !ownerId) return;
      channel = supabase
        .channel(`profile-suspension-${ownerId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${ownerId}` },
          (payload: { new?: { is_suspended?: boolean } }) => {
            if (payload.new?.is_suspended) {
              toast.error("Your account has been suspended by admin.");
              supabase.auth.signOut().finally(() => {
                if (typeof window !== "undefined") window.location.href = "/auth";
              });
            }
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    try {
      const { data: { session: cur } } = await supabase.auth.getSession();
      if (cur?.user) {
        const sid = `${cur.user.id}-${cur.access_token.slice(-24)}`;
        await supabase
          .from("active_sessions")
          .update({ is_active: false, invalidated_reason: "user_logout" })
          .eq("session_id", sid);
      }
    } catch {}
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
