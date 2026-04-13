import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) throw new Error("Not an admin");

    const { action, params } = await req.json();

    // ─── GET STATS ───
    if (action === "get_stats") {
      const [users, stores, orders, subs] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("stores").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("total_amount"),
        supabase.from("subscriptions").select("plan, status"),
      ]);

      const totalRevenue = (orders.data || []).reduce((s: number, o: any) => s + Number(o.total_amount), 0);
      const activeSubs = (subs.data || []).filter((s: any) => s.status === "active");
      const planBreakdown = { free: 0, pro: 0, business: 0 };
      activeSubs.forEach((s: any) => {
        if (s.plan in planBreakdown) planBreakdown[s.plan as keyof typeof planBreakdown]++;
      });

      return json({
        totalUsers: users.count || 0,
        totalStores: stores.count || 0,
        totalOrders: (orders.data || []).length,
        totalRevenue,
        activeSubs: activeSubs.length,
        planBreakdown,
      });
    }

    // ─── GET USERS ───
    if (action === "get_users") {
      const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      const { data: allStores } = await supabase.from("stores").select("id, name, user_id");
      const { data: allSubs } = await supabase.from("subscriptions").select("user_id, plan, status").eq("status", "active");

      const storeMap: Record<string, any[]> = {};
      (allStores || []).forEach((s: any) => {
        if (!storeMap[s.user_id]) storeMap[s.user_id] = [];
        storeMap[s.user_id].push(s);
      });

      const planMap: Record<string, string> = {};
      (allSubs || []).forEach((s: any) => {
        const current = planMap[s.user_id];
        const levels: Record<string, number> = { free: 0, pro: 1, business: 2 };
        if (!current || (levels[s.plan] || 0) > (levels[current] || 0)) {
          planMap[s.user_id] = s.plan;
        }
      });

      const result = (profiles || []).map((p: any) => {
        const userStores = storeMap[p.id] || [];
        const userPlan = planMap[p.id] || "free";
        return {
          id: p.id,
          name: p.name,
          email: p.email,
          created_at: p.created_at,
          plan: userPlan,
          storeCount: userStores.length,
          stores: userStores.map((s: any) => ({ id: s.id, name: s.name, plan: userPlan })),
        };
      });

      return json(result);
    }

    // ─── GET USER DETAILS ───
    if (action === "get_user_details") {
      const userId = params.user_id;
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
      const { data: stores } = await supabase.from("stores").select("*").eq("user_id", userId);
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const userPlan = sub?.plan || "free";

      const storesWithStats = await Promise.all(
        (stores || []).map(async (store: any) => {
          const [prods, custs, ords] = await Promise.all([
            supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", store.id),
            supabase.from("customers").select("id", { count: "exact", head: true }).eq("store_id", store.id),
            supabase.from("orders").select("total_amount").eq("store_id", store.id),
          ]);
          const revenue = (ords.data || []).reduce((s: number, o: any) => s + Number(o.total_amount), 0);
          return {
            id: store.id,
            name: store.name,
            is_active: store.is_active,
            created_at: store.created_at,
            plan: userPlan,
            productCount: prods.count || 0,
            customerCount: custs.count || 0,
            orderCount: (ords.data || []).length,
            revenue,
          };
        })
      );

      return json({ profile, stores: storesWithStats });
    }

    // ─── GET STORES ───
    if (action === "get_stores") {
      const { data: stores } = await supabase.from("stores").select("*").order("created_at", { ascending: false });
      const ownerIds = [...new Set((stores || []).map((s: any) => s.user_id))];
      const { data: profiles } = ownerIds.length > 0
        ? await supabase.from("profiles").select("id, name, email").in("id", ownerIds)
        : { data: [] };
      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

      const result = (stores || []).map((s: any) => ({
        id: s.id, name: s.name, phone: s.phone, address: s.address,
        is_active: s.is_active, created_at: s.created_at,
        owner: profileMap[s.user_id] || { name: "", email: "" },
      }));
      return json(result);
    }

    // ─── GET STORE DETAILS ───
    if (action === "get_store_details") {
      const storeId = params.store_id;
      const { data: store } = await supabase.from("stores").select("*").eq("id", storeId).maybeSingle();
      if (!store) throw new Error("Store not found");

      // Fetch owner profile separately
      const { data: ownerProfile } = await supabase.from("profiles").select("id, name, email").eq("id", store.user_id).maybeSingle();
      store.profiles = ownerProfile;

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", store.user_id)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const plan = sub?.plan || "free";

      const [prods, custs, ords, storeSubs] = await Promise.all([
        supabase.from("products").select("id, name, price, stock, is_active, category, created_at").eq("store_id", storeId),
        supabase.from("customers").select("id, name, email, phone, created_at").eq("store_id", storeId),
        supabase.from("orders").select("id, total_amount, cost_price, status, payment_status, payment_method, created_at").eq("store_id", storeId).order("created_at", { ascending: false }),
        supabase.from("subscriptions").select("id, plan, status, product_name, variation, price, start_date, end_date").eq("store_id", storeId),
      ]);

      const orders = ords.data || [];
      const completedOrders = orders.filter((o: any) => o.status === "completed").length;
      const totalRevenue = orders.reduce((s: number, o: any) => s + Number(o.total_amount), 0);
      const totalProfit = orders.reduce((s: number, o: any) => s + (Number(o.total_amount) - Number(o.cost_price)), 0);

      return json({
        store, plan,
        stats: {
          totalProducts: (prods.data || []).length,
          totalCustomers: (custs.data || []).length,
          totalOrders: orders.length,
          totalRevenue, totalProfit, completedOrders,
          pendingOrders: orders.filter((o: any) => o.status === "pending").length,
        },
        products: prods.data || [],
        customers: custs.data || [],
        orders,
        subscriptions: storeSubs.data || [],
      });
    }

    // ─── TOGGLE STORE ───
    if (action === "toggle_store") {
      await supabase.from("stores").update({ is_active: params.is_active }).eq("id", params.store_id);
      return json({ success: true });
    }

    // ─── DELETE STORE ───
    if (action === "delete_store") {
      await supabase.from("stores").delete().eq("id", params.store_id);
      return json({ success: true });
    }

    // ─── CHANGE PLAN (with notification) ───
    if (action === "change_plan") {
      const { store_id, new_plan, user_id: targetUserId } = params;

      // Determine user_id — either passed directly or from store
      let userId = targetUserId;
      if (!userId && store_id) {
        const { data: store } = await supabase.from("stores").select("user_id").eq("id", store_id).single();
        if (!store) throw new Error("Store not found");
        userId = store.user_id;
      }
      if (!userId) throw new Error("No user_id or store_id provided");

      // Deactivate existing active PLATFORM subscriptions for this user (not customer subs)
      await supabase
        .from("subscriptions")
        .update({ status: "expired" })
        .eq("user_id", userId)
        .eq("status", "active")
        .is("customer_id", null);

      // Insert new active subscription (user-level plan)
      if (new_plan !== "free") {
        await supabase.from("subscriptions").insert({
          user_id: userId,
          plan: new_plan,
          status: "active",
          product_name: `${new_plan.charAt(0).toUpperCase() + new_plan.slice(1)} Plan`,
          price: 0,
          cost_price: 0,
          variation: "Admin Assigned",
          start_date: new Date().toISOString(),
          store_id: store_id || null,
        });
      }

      // Send notification to user
      const planLabel = new_plan.charAt(0).toUpperCase() + new_plan.slice(1);
      await supabase.from("notifications").insert({
        user_id: userId,
        type: "success",
        message: `🎉 Your plan has been upgraded to ${planLabel}! New features are now unlocked.`,
      });

      return json({ success: true });
    }

    // ─── GET PLAN PAYMENTS ───
    if (action === "get_plan_payments") {
      const { data: payments } = await supabase
        .from("plan_payments")
        .select("*, payment_gateways:gateway_id(gateway_name)")
        .order("created_at", { ascending: false });

      const userIds = [...new Set((payments || []).map((p: any) => p.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, name, email").in("id", userIds);
      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

      const storeIds = [...new Set((payments || []).filter((p: any) => p.store_id).map((p: any) => p.store_id))];
      const { data: stores } = storeIds.length > 0
        ? await supabase.from("stores").select("id, name").in("id", storeIds)
        : { data: [] };
      const storeMap: Record<string, string> = {};
      (stores || []).forEach((s: any) => { storeMap[s.id] = s.name; });

      const result = (payments || []).map((p: any) => ({
        ...p,
        gateway_name: p.payment_gateways?.gateway_name || "",
        user_name: profileMap[p.user_id]?.name || "",
        user_email: profileMap[p.user_id]?.email || "",
        store_name: p.store_id ? storeMap[p.store_id] || "" : "",
      }));

      return json(result);
    }

    // ─── REVIEW PLAN PAYMENT ───
    if (action === "review_plan_payment") {
      const { payment_id, status, admin_notes } = params;

      // Update payment status
      await supabase
        .from("plan_payments")
        .update({ status, admin_notes, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
        .eq("id", payment_id);

      // If approved, activate the plan
      if (status === "approved") {
        const { data: payment } = await supabase.from("plan_payments").select("*").eq("id", payment_id).single();
        if (payment) {
          // Deactivate existing platform subscriptions only
          await supabase
            .from("subscriptions")
            .update({ status: "expired" })
            .eq("user_id", payment.user_id)
            .eq("status", "active")
            .is("customer_id", null);

          // Create new subscription
          if (payment.plan !== "free") {
            await supabase.from("subscriptions").insert({
              user_id: payment.user_id,
              plan: payment.plan,
              status: "active",
              product_name: `${payment.plan.charAt(0).toUpperCase() + payment.plan.slice(1)} Plan`,
              price: payment.amount,
              cost_price: 0,
              variation: "Payment Approved",
              start_date: new Date().toISOString(),
              store_id: payment.store_id || null,
            });
          }

          // Send notification
          const planLabel = payment.plan.charAt(0).toUpperCase() + payment.plan.slice(1);
          await supabase.from("notifications").insert({
            user_id: payment.user_id,
            type: "success",
            message: `🎉 Your payment has been approved! Plan upgraded to ${planLabel}.`,
          });
        }
      } else if (status === "rejected") {
        // Notify rejection
        const { data: payment } = await supabase.from("plan_payments").select("user_id").eq("id", payment_id).single();
        if (payment) {
          await supabase.from("notifications").insert({
            user_id: payment.user_id,
            type: "error",
            message: `Your plan payment was rejected.${admin_notes ? ` Reason: ${admin_notes}` : ""} Please contact support.`,
          });
        }
      }

      return json({ success: true });
    }

    // ─── GET PAYMENT GATEWAYS ───
    if (action === "get_payment_gateways") {
      const { data } = await supabase
        .from("payment_gateways")
        .select("*")
        .order("sort_order", { ascending: true });
      return json(data || []);
    }

    // ─── CREATE PAYMENT GATEWAY ───
    if (action === "create_payment_gateway") {
      const { currency, gateway_name, gateway_type, qr_code_url, payment_details, is_active, sort_order, mode, api_config, icon_url } = params;
      const { error } = await supabase.from("payment_gateways").insert({
        currency, gateway_name, gateway_type, qr_code_url: qr_code_url || "",
        payment_details: payment_details || {}, is_active: is_active ?? true,
        sort_order: sort_order || 0, mode: mode || "manual",
        api_config: api_config || {}, icon_url: icon_url || "",
      });
      if (error) throw error;
      return json({ success: true });
    }

    // ─── UPDATE PAYMENT GATEWAY ───
    if (action === "update_payment_gateway") {
      const { gateway_id, ...updates } = params;
      const { error } = await supabase.from("payment_gateways").update(updates).eq("id", gateway_id);
      if (error) throw error;
      return json({ success: true });
    }

    // ─── DELETE PAYMENT GATEWAY ───
    if (action === "delete_payment_gateway") {
      const { error } = await supabase.from("payment_gateways").delete().eq("id", params.gateway_id);
      if (error) throw error;
      return json({ success: true });
    }

    // ─── GET AUTO PAYMENT LOGS ───
    if (action === "get_auto_payment_logs") {
      const { data } = await supabase
        .from("auto_payment_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      return json(data || []);
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
