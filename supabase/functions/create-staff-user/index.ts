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
        status: 200,
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
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { name, email, password, phone, role, permissions, store_id } = body;

    if (!name || !email || !password) {
      return new Response(
        JSON.stringify({ error: "Name, email and password are required" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        {
          status: 200,
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
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Check if this email already exists as staff for this store
    const { data: existingStaff } = await supabaseAdmin
      .from("staff_members")
      .select("id")
      .eq("email", email)
      .eq("user_id", caller.id)
      .maybeSingle();

    if (existingStaff) {
      return new Response(
        JSON.stringify({ error: "This email is already added as staff" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Try to create auth user for staff
    let authUserId: string;
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, is_staff: true },
      });

    if (authError) {
      // If email already exists, look up the existing user
      if (authError.message?.includes("already been registered")) {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = listData?.users?.find(
          (u: any) => u.email === email
        );
        if (!existingUser) {
          return new Response(
            JSON.stringify({
              error: "Email exists but user not found. Contact support.",
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        authUserId = existingUser.id;
      } else {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      authUserId = authData.user.id;
    }

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
      // Don't cleanup auth user if it already existed
      if (!authError) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      }
      return new Response(JSON.stringify({ error: staffError.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ staff: staffData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
