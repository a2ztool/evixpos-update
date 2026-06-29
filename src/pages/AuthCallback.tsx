import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import evixLogo from "@/assets/evixpos-logo.png";

/**
 * Dedicated OAuth callback route.
 * Supabase finishes the OAuth handshake (parses hash / exchanges ?code= for a session),
 * then we route the user based on role + onboarding status — without ever rendering
 * the marketing landing page in between.
 */
const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    let routed = false;

    const route = async (uid: string) => {
      if (routed) return;
      routed = true;
      // Strip OAuth params before navigating away
      if (typeof window !== "undefined") {
        window.history.replaceState({}, document.title, "/auth/callback");
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin")
        .maybeSingle();
      if (cancelled) return;
      if (roleData) {
        navigate("/admin/dashboard", { replace: true });
        return;
      }

      const { data: staffRow } = await supabase
        .from("staff_members")
        .select("id")
        .eq("auth_user_id", uid)
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled) return;
      if (staffRow) {
        navigate("/dashboard", { replace: true });
        return;
      }

      const { count } = await supabase
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid);
      if (cancelled) return;
      // New Google sign-ups (no stores yet) always go to onboarding first.
      navigate((count ?? 0) > 0 ? "/dashboard" : "/onboarding", { replace: true });
    };

    // Try existing session first (PKCE may already be exchanged)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) route(data.session.user.id);
    });

    // Listen for sign-in completion (hash flow / async exchange)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) route(session.user.id);
    });

    // Safety fallback: if nothing happens within 8s, send to /auth
    const timeout = setTimeout(() => {
      if (!cancelled) navigate("/auth", { replace: true });
    }, 8000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-b from-primary/5 via-background to-background px-4">
      <img src={evixLogo} alt="EvixPos" className="h-12 w-auto mb-8" />
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4" />
      <p className="text-sm font-medium text-foreground">Signing you in…</p>
      <p className="text-xs text-muted-foreground mt-1">Verifying your account</p>
    </div>
  );
};

export default AuthCallback;