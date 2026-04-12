import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { name, email, password, phone, role, permissions, store_id } = body;

    if (!name || !email || !password) {
      return new Response(
        JSON.stringify({ error: "Name, email and password are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({
          error: "Password must be at least 6 characters",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify caller owns the store if store_id is provided
    if (store_id) {
      const { data: store } = await supabaseAdmin
        .from("stores")
        .select("user_id")
        .eq("id", store_id)
        .single();

      if (!store || store.user_id !== caller.id) {
        return new Response(
          JSON.stringify({ error: "You don't own this store" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Create auth user for staff
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, is_staff: true },
      });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUserId = authData.user.id;

    // Insert staff member record
    const { data: staffData, error: staffError } = await supabaseAdmin
      .from("staff_members")
      .insert({
        user_id: caller.id,
        auth_user_id: authUserId,
        name,
        email,
        phone: phone || "",
        role: role || "staff",
        permissions: permissions || [],
        store_id: store_id || null,
        is_active: true,
      })
      .select()
      .single();

    if (staffError) {
      // Cleanup: delete the auth user if staff record fails
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return new Response(JSON.stringify({ error: staffError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ staff: staffData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
