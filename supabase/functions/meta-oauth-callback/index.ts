import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || req.headers.get("x-action");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const metaAppId = Deno.env.get("META_APP_ID")!;
    const metaAppSecret = Deno.env.get("META_APP_SECRET")!;

    // Action: get OAuth URL
    if (action === "get_auth_url") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(
        authHeader.replace("Bearer ", "")
      );
      if (claimsErr || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json();
      const { store_id, redirect_uri, redirect_after_auth } = body;

      if (!store_id || !redirect_uri) {
        return new Response(JSON.stringify({ error: "store_id and redirect_uri required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // State encodes user_id + store_id + redirect_after_auth for the callback
      const state = btoa(JSON.stringify({
        user_id: claimsData.claims.sub,
        store_id,
        redirect_uri,
        redirect_after_auth: redirect_after_auth || `${new URL(redirect_uri).origin}/finance/facebook-ads`,
      }));

      const scopes = [
        "ads_read",
        "ads_management",
        "read_insights",
        "business_management",
      ].join(",");

      const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirect_uri)}&state=${encodeURIComponent(state)}&scope=${scopes}&response_type=code`;

      return new Response(JSON.stringify({ auth_url: authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // OAuth Callback Handler: exchange code for token and redirect
    const callbackCode = url.searchParams.get("code");
    const callbackState = url.searchParams.get("state");
    
    // If code and state are in query params, this is the OAuth callback
    if (callbackCode && callbackState) {
      let stateData: { user_id: string; store_id: string; redirect_uri: string; redirect_after_auth: string };
      try {
        stateData = JSON.parse(atob(callbackState));
      } catch {
        return new Response(null, {
          status: 302,
          headers: {
            "Location": `${stateData?.redirect_after_auth || "/finance/facebook-ads"}?error=invalid_state`,
          },
        });
      }

      // Exchange code for short-lived token
      const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(stateData.redirect_uri)}&client_secret=${metaAppSecret}&code=${callbackCode}`;

      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        return new Response(null, {
          status: 302,
          headers: {
            "Location": `${stateData.redirect_after_auth}?error=${encodeURIComponent(tokenData.error.message || "Token exchange failed")}`,
          },
        });
      }

      // Exchange for long-lived token
      const longTokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${tokenData.access_token}`;

      const longTokenRes = await fetch(longTokenUrl);
      const longTokenData = await longTokenRes.json();

      const accessToken = longTokenData.access_token || tokenData.access_token;
      const expiresIn = longTokenData.expires_in || tokenData.expires_in || 5184000;

      // Fetch ad accounts
      const accountsRes = await fetch(
        `https://graph.facebook.com/v21.0/me/adaccounts?fields=name,account_id,account_status&access_token=${accessToken}`
      );
      const accountsData = await accountsRes.json();

      const firstAccount = accountsData.data?.[0];

      // Store in Supabase using service role
      const supabaseAdmin = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      const { error: upsertError } = await supabaseAdmin
        .from("meta_ad_accounts")
        .upsert(
          {
            user_id: stateData.user_id,
            store_id: stateData.store_id,
            access_token: accessToken,
            ad_account_id: firstAccount?.id || null,
            account_name: firstAccount?.name || "Facebook Ads",
            token_expires_at: expiresAt,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,store_id" }
        );

      if (upsertError) {
        return new Response(null, {
          status: 302,
          headers: {
            "Location": `${stateData.redirect_after_auth}?error=${encodeURIComponent("Failed to save token: " + upsertError.message)}`,
          },
        });
      }

      // Success - redirect back to the app
      return new Response(null, {
        status: 302,
        headers: {
          "Location": `${stateData.redirect_after_auth}?connected=true&account=${encodeURIComponent(firstAccount?.name || "Facebook Ads")}`,
        },
      });
    }

    // API Action: exchange code for token (for manual/API usage)
    if (action === "exchange_token") {
      const body = await req.json();
      const { code, state, redirect_uri } = body;

      if (!code || !state) {
        return new Response(JSON.stringify({ error: "code and state required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let stateData: { user_id: string; store_id: string; redirect_uri: string };
      try {
        stateData = JSON.parse(atob(state));
      } catch {
        return new Response(JSON.stringify({ error: "Invalid state" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Exchange code for short-lived token
      const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirect_uri || "https://identical-copy.lovable.app/api/facebook/callback")}&client_secret=${metaAppSecret}&code=${code}`;

      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        return new Response(JSON.stringify({ error: tokenData.error.message || "Token exchange failed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Exchange for long-lived token
      const longTokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${tokenData.access_token}`;

      const longTokenRes = await fetch(longTokenUrl);
      const longTokenData = await longTokenRes.json();

      const accessToken = longTokenData.access_token || tokenData.access_token;
      const expiresIn = longTokenData.expires_in || tokenData.expires_in || 5184000;

      // Fetch ad accounts
      const accountsRes = await fetch(
        `https://graph.facebook.com/v21.0/me/adaccounts?fields=name,account_id,account_status&access_token=${accessToken}`
      );
      const accountsData = await accountsRes.json();

      const firstAccount = accountsData.data?.[0];

      // Store in Supabase using service role
      const supabaseAdmin = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      const { error: upsertError } = await supabaseAdmin
        .from("meta_ad_accounts")
        .upsert(
          {
            user_id: stateData.user_id,
            store_id: stateData.store_id,
            access_token: accessToken,
            ad_account_id: firstAccount?.id || null,
            account_name: firstAccount?.name || "Facebook Ads",
            token_expires_at: expiresAt,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,store_id" }
        );

      if (upsertError) {
        return new Response(JSON.stringify({ error: "Failed to save token: " + upsertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          account_name: firstAccount?.name || "Facebook Ads",
          ad_account_id: firstAccount?.id || null,
          ad_accounts: accountsData.data || [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: disconnect
    if (action === "disconnect") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(
        authHeader.replace("Bearer ", "")
      );
      if (claimsErr || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json();
      const { store_id } = body;

      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await supabaseAdmin
        .from("meta_ad_accounts")
        .delete()
        .eq("user_id", claimsData.claims.sub)
        .eq("store_id", store_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
