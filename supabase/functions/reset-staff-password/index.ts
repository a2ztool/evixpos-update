import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" });

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" });

    const { staff_id, new_password } = await req.json();
    if (!staff_id || !new_password) return json({ error: "staff_id and new_password are required" });
    if (typeof new_password !== "string" || new_password.length < 6) {
      return json({ error: "Password must be at least 6 characters" });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller owns the staff record
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff_members")
      .select("id, user_id, auth_user_id, email")
      .eq("id", staff_id)
      .maybeSingle();

    if (staffErr || !staff) return json({ error: "Staff member not found" });
    if (staff.user_id !== caller.id) return json({ error: "You don't manage this staff member" });
    if (!staff.auth_user_id) return json({ error: "Staff has no linked auth account" });

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      staff.auth_user_id,
      { password: new_password },
    );
    if (updateErr) return json({ error: updateErr.message });

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message });
  }
});
