import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const FacebookCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");

      if (!code || !state) {
        setError("Missing code or state parameter");
        setTimeout(() => navigate("/finance/facebook-ads?error=missing_params"), 2000);
        return;
      }

      try {
        const { data, error: fnError } = await supabase.functions.invoke("meta-oauth-callback", {
          body: {
            code,
            state,
            redirect_uri: "https://identical-copy.lovable.app/api/facebook/callback",
          },
          headers: { "x-action": "exchange_token" },
        });

        if (fnError || data?.error) {
          const msg = data?.error || fnError?.message || "Token exchange failed";
          navigate(`/finance/facebook-ads?error=${encodeURIComponent(msg)}`);
          return;
        }

        const account = data?.account_name || "Facebook Ads";
        navigate(`/finance/facebook-ads?connected=true&account=${encodeURIComponent(account)}`);
      } catch (err: any) {
        navigate(`/finance/facebook-ads?error=${encodeURIComponent(err.message)}`);
      }
    };

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-muted-foreground">Connecting your Facebook Ads account...</p>
    </div>
  );
};

export default FacebookCallback;
