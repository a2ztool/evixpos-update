// Admin-data edge function v5 — added get_analytics_trends and forced redeploy
// Force redeploy: 2026-04-17T02:18:00Z
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
    if (!authHeader) return errorResponse("Unauthorized", 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin", "support_admin", "finance_admin"]);
    if (!roleRows || roleRows.length === 0) return errorResponse("Not an admin", 403);
    const adminRoles: string[] = roleRows.map((r: any) => r.role);
    const isSuperAdmin = adminRoles.includes("super_admin") || adminRoles.includes("admin");
    const can = (...allowed: string[]) => allowed.some((r) => adminRoles.includes(r));

    // Permission gate for tier-restricted actions
    const FINANCE_ACTIONS = new Set([
      "get_finance_metrics","get_plan_payments","review_plan_payment","get_auto_payment_logs",
      "get_payment_gateways","create_payment_gateway","update_payment_gateway","delete_payment_gateway",
      "export_payments","export_finance","delete_plan_payment","bulk_delete_plan_payments",
    ]);
    const SUPPORT_ACTIONS = new Set(["get_users","get_user_details","get_stores","get_store_details","impersonate_user"]);
    const SUPER_ONLY = new Set([
      "admin_change_user_plan","admin_extend_plan","update_plans_config","toggle_store","delete_store",
      "send_broadcast","delete_broadcast","update_system_setting","update_feature_flag","update_system_template",
      "set_user_role","remove_user_role","admin_set_overrides","admin_clear_overrides",
    ]);

    const body = await req.json();
    const action = body.action;
    const params = body.params || {};

    // Tier-based authorization
    if (SUPER_ONLY.has(action) && !isSuperAdmin) {
      return errorResponse("Only super admins can perform this action", 403);
    }
    if (FINANCE_ACTIONS.has(action) && !can("admin","super_admin","finance_admin")) {
      return errorResponse("Finance admin role required", 403);
    }
    if (SUPPORT_ACTIONS.has(action) && !can("admin","super_admin","support_admin")) {
      return errorResponse("Support admin role required", 403);
    }


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

    // ─── GET PLAN STATS ───
    if (action === "get_plan_stats") {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("plan, status, end_date")
        .eq("status", "active")
        .in("plan", ["free", "pro", "business"]);
      const { count: totalUsers } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });
      const breakdown = { free: 0, pro: 0, business: 0 };
      let expiringSoon = 0;
      const now = new Date();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      (subs || []).forEach((s: any) => {
        if (s.plan in breakdown) breakdown[s.plan as keyof typeof breakdown]++;
        if (s.end_date) {
          const diff = new Date(s.end_date).getTime() - now.getTime();
          if (diff > 0 && diff < sevenDays) expiringSoon++;
        }
      });
      return json({ totalUsers: totalUsers || 0, planBreakdown: breakdown, expiringSoon, totalRevenue: 0 });
    }

    // ─── GET PLAN HISTORY ───
    if (action === "get_plan_history") {
      const { data } = await supabase
        .from("plan_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      const userIds = [...new Set((data || []).map((h: any) => h.user_id))];
      const { data: profiles } = userIds.length > 0
        ? await supabase.from("profiles").select("id, email").in("id", userIds)
        : { data: [] };
      const emailMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { emailMap[p.id] = p.email; });
      const result = (data || []).map((h: any) => ({ ...h, user_email: emailMap[h.user_id] || "" }));
      return json(result);
    }

    // ─── UPDATE PLANS CONFIG ───
    if (action === "update_plans_config") {
      const { configs: configRows } = params;
      for (const row of configRows) {
        const { id, plan_type, volume, price_inr, price_bdt, store_limit, product_limit, customer_limit } = row;
        if (id) {
          await supabase.from("plans_config").update({
            price_inr, price_bdt, store_limit, product_limit, customer_limit, updated_at: new Date().toISOString(),
          }).eq("id", id);
        } else {
          await supabase.from("plans_config").upsert({
            plan_type, volume, price_inr, price_bdt, store_limit, product_limit, customer_limit, updated_at: new Date().toISOString(),
          }, { onConflict: "plan_type,volume" });
        }
      }
      return json({ success: true });
    }

    // ─── ADMIN CHANGE USER PLAN (with history) ───
    if (action === "admin_change_user_plan") {
      const { user_id: targetUserId, new_plan, new_volume, billing_type, price, duration_days, notes } = params;
      const { data: currentSub } = await supabase.from("subscriptions").select("plan, volume")
        .eq("user_id", targetUserId).eq("status", "active").in("plan", ["free", "pro", "business"]).maybeSingle();
      const oldPlan = currentSub?.plan || "free";
      const oldVolume = (currentSub as any)?.volume || null;

      await supabase.from("subscriptions").update({ status: "expired" })
        .eq("user_id", targetUserId).eq("status", "active").in("plan", ["free", "pro", "business"]);

      const startDate = new Date();
      const days = new_plan === "free" ? 0 : (billing_type === "yearly" ? 365 : (duration_days || 30));
      const endDate = new_plan === "free" ? null : new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("subscriptions").insert({
        user_id: targetUserId, plan: new_plan, status: "active",
        product_name: `${new_plan.charAt(0).toUpperCase() + new_plan.slice(1)} Plan`,
        price: price || 0, cost_price: 0, variation: "Admin Changed",
        start_date: startDate.toISOString(), end_date: endDate, store_id: null,
        volume: new_volume || null, billing_type: billing_type || "monthly",
      });

      // Log to plan_history
      try {
        await supabase.from("plan_history").insert({
          user_id: targetUserId, action: "admin_change",
          old_plan: oldPlan, new_plan: new_plan,
          old_volume: oldVolume, new_volume: new_volume || null,
          changed_by: user.id,
        });
      } catch (_e) { /* plan_history table may not exist yet */ }

      const planLabel = new_plan.charAt(0).toUpperCase() + new_plan.slice(1);
      await supabase.from("notifications").insert({
        user_id: targetUserId, type: "success",
        message: `🎉 Your plan has been changed to ${planLabel} by admin.`,
      });

      return json({ success: true });
    }

    // ─── ADMIN EXTEND USER PLAN ───
    if (action === "admin_extend_plan") {
      const { user_id: targetUserId, extend_days } = params;
      const { data: currentSub } = await supabase.from("subscriptions").select("id, plan, end_date, volume")
        .eq("user_id", targetUserId).eq("status", "active").in("plan", ["pro", "business"]).maybeSingle();
      if (!currentSub) return json({ success: false, error: "No active paid plan found" });

      const currentEnd = currentSub.end_date ? new Date(currentSub.end_date) : new Date();
      const newEnd = new Date(currentEnd.getTime() + (extend_days || 30) * 24 * 60 * 60 * 1000);
      await supabase.from("subscriptions").update({ end_date: newEnd.toISOString() }).eq("id", currentSub.id);

      try {
        await supabase.from("plan_history").insert({
          user_id: targetUserId, action: "extend",
          old_plan: currentSub.plan, new_plan: currentSub.plan,
          old_volume: (currentSub as any).volume, new_volume: (currentSub as any).volume,
          changed_by: user.id,
        });
      } catch (_e) { /* plan_history table may not exist yet */ }

      await supabase.from("notifications").insert({
        user_id: targetUserId, type: "success",
        message: `📅 Your plan has been extended by ${extend_days} days by admin.`,
      });

      return json({ success: true });
    }

    // ─── GET USERS ───
    if (action === "get_users") {
      const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      const { data: allStores } = await supabase.from("stores").select("id, name, user_id");
      const { data: allSubs } = await supabase.from("subscriptions").select("user_id, plan, status, start_date, end_date").eq("status", "active").in("plan", ["free", "pro", "business"]);

      const storeMap: Record<string, any[]> = {};
      (allStores || []).forEach((s: any) => {
        if (!storeMap[s.user_id]) storeMap[s.user_id] = [];
        storeMap[s.user_id].push(s);
      });

      const planMap: Record<string, { plan: string; start_date: string | null; end_date: string | null }> = {};
      (allSubs || []).forEach((s: any) => {
        const current = planMap[s.user_id];
        const levels: Record<string, number> = { free: 0, pro: 1, business: 2 };
        if (!current || (levels[s.plan] || 0) > (levels[current.plan] || 0)) {
          planMap[s.user_id] = { plan: s.plan, start_date: s.start_date, end_date: s.end_date };
        }
      });

      const now = new Date();
      const result = (profiles || []).map((p: any) => {
        const userStores = storeMap[p.id] || [];
        const subInfo = planMap[p.id] || { plan: "free", start_date: null, end_date: null };
        const endDate = subInfo.end_date ? new Date(subInfo.end_date) : null;
        const remainingDays = endDate ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null;
        const planStatus = subInfo.plan === "free" ? "lifetime" : endDate ? (remainingDays! > 0 ? "active" : "expired") : "active";

        return {
          id: p.id, name: p.name, email: p.email, created_at: p.created_at,
          is_suspended: !!p.is_suspended,
          suspended_at: p.suspended_at || null,
          suspended_reason: p.suspended_reason || null,
          plan: subInfo.plan, start_date: subInfo.start_date, end_date: subInfo.end_date,
          remaining_days: remainingDays, plan_status: planStatus,
          storeCount: userStores.length,
          stores: userStores.map((s: any) => ({ id: s.id, name: s.name, plan: subInfo.plan })),
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
        .select("plan, start_date, end_date, volume, price, billing_type")
        .eq("user_id", userId).eq("status", "active").is("customer_id", null)
        .in("plan", ["free", "pro", "business"])
        .order("start_date", { ascending: false }).limit(1).maybeSingle();
      const userPlan = sub?.plan || "free";
      const now = new Date();
      const endDate = sub?.end_date ? new Date(sub.end_date) : null;
      const remainingDays = endDate ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null;
      const planStatus = userPlan === "free" ? "lifetime" : endDate ? (remainingDays! > 0 ? "active" : "expired") : "active";

      const storesWithStats = await Promise.all(
        (stores || []).map(async (store: any) => {
          const [prods, custs, ords] = await Promise.all([
            supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", store.id),
            supabase.from("customers").select("id", { count: "exact", head: true }).eq("store_id", store.id),
            supabase.from("orders").select("total_amount").eq("store_id", store.id),
          ]);
          const revenue = (ords.data || []).reduce((s: number, o: any) => s + Number(o.total_amount), 0);
          return {
            id: store.id, name: store.name, is_active: store.is_active, created_at: store.created_at,
            plan: userPlan, productCount: prods.count || 0, customerCount: custs.count || 0,
            orderCount: (ords.data || []).length, revenue,
          };
        })
      );

      return json({
        profile, stores: storesWithStats,
        plan_info: {
          plan: userPlan, start_date: sub?.start_date || null, end_date: sub?.end_date || null,
          remaining_days: remainingDays, plan_status: planStatus,
          volume: sub?.volume || null, price: sub?.price || null, billing_type: sub?.billing_type || null,
        },
      });
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

      const { data: ownerProfile } = await supabase.from("profiles").select("id, name, email").eq("id", store.user_id).maybeSingle();
      store.profiles = ownerProfile;

      const { data: sub } = await supabase
        .from("subscriptions").select("plan").eq("user_id", store.user_id).eq("status", "active")
        .order("start_date", { ascending: false }).limit(1).maybeSingle();
      const plan = sub?.plan || "free";

      const [prods, custs, ords, storeSubs] = await Promise.all([
        supabase.from("products").select("id, name, price, stock, is_active, category, created_at").eq("store_id", storeId),
        supabase.from("customers").select("id, name, email, phone, created_at").eq("store_id", storeId),
        supabase.from("orders").select("id, total_amount, cost_price, status, payment_status, payment_method, created_at").eq("store_id", storeId).order("created_at", { ascending: false }),
        supabase.from("subscriptions").select("id, plan, status, product_name, variation, price, start_date, end_date").eq("store_id", storeId),
      ]);

      const orders = ords.data || [];
      return json({
        store, plan,
        stats: {
          totalProducts: (prods.data || []).length, totalCustomers: (custs.data || []).length,
          totalOrders: orders.length,
          totalRevenue: orders.reduce((s: number, o: any) => s + Number(o.total_amount), 0),
          totalProfit: orders.reduce((s: number, o: any) => s + (Number(o.total_amount) - Number(o.cost_price)), 0),
          completedOrders: orders.filter((o: any) => o.status === "completed").length,
          pendingOrders: orders.filter((o: any) => o.status === "pending").length,
        },
        products: prods.data || [], customers: custs.data || [], orders, subscriptions: storeSubs.data || [],
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
      let userId = targetUserId;
      if (!userId && store_id) {
        const { data: store } = await supabase.from("stores").select("user_id").eq("id", store_id).single();
        if (!store) throw new Error("Store not found");
        userId = store.user_id;
      }
      if (!userId) throw new Error("No user_id or store_id provided");

      await supabase.from("subscriptions").update({ status: "expired" })
        .eq("user_id", userId).eq("status", "active").in("plan", ["free", "pro", "business"]);

      if (new_plan !== "free") {
        const startDate = new Date();
        const durationDays = params.billing_type === "yearly" ? 365 : (params.duration_days || 30);
        const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
        await supabase.from("subscriptions").insert({
          user_id: userId, plan: new_plan, status: "active",
          product_name: `${new_plan.charAt(0).toUpperCase() + new_plan.slice(1)} Plan`,
          price: params.price || 0, cost_price: 0, variation: "Admin Assigned",
          start_date: startDate.toISOString(), end_date: endDate.toISOString(),
          store_id: store_id || null, volume: params.volume || null, billing_type: params.billing_type || "monthly",
        });
      } else {
        await supabase.from("subscriptions").insert({
          user_id: userId, plan: "free", status: "active", product_name: "Free Plan",
          price: 0, cost_price: 0, variation: "Admin Assigned",
          start_date: new Date().toISOString(), end_date: null,
          store_id: store_id || null, volume: null, billing_type: "monthly",
        });
      }

      const planLabel = new_plan.charAt(0).toUpperCase() + new_plan.slice(1);
      await supabase.from("notifications").insert({
        user_id: userId, type: "success",
        message: `🎉 Your plan has been upgraded to ${planLabel}! New features are now unlocked.`,
      });
      return json({ success: true });
    }

    // ─── GET PLAN PAYMENTS ───
    if (action === "get_plan_payments") {
      const { data: payments } = await supabase
        .from("plan_payments").select("*, payment_gateways:gateway_id(gateway_name)")
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

      const prettyGateway = (g: string) => {
        const k = (g || "").toLowerCase();
        if (k === "zinipay") return "ZiniPay";
        if (k === "razorpay") return "Razorpay";
        if (!k) return "";
        return g.charAt(0).toUpperCase() + g.slice(1);
      };
      const result = (payments || []).map((p: any) => ({
        ...p,
        gateway_name: p.payment_gateways?.gateway_name || prettyGateway(p.gateway) || "",
        user_name: profileMap[p.user_id]?.name || "", user_email: profileMap[p.user_id]?.email || "",
        store_name: p.store_id ? storeMap[p.store_id] || "" : "",
      }));
      return json(result);
    }

    // ─── REVIEW PLAN PAYMENT ───
    if (action === "review_plan_payment") {
      const { payment_id, status, admin_notes } = params;
      await supabase.from("plan_payments")
        .update({ status, admin_notes, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
        .eq("id", payment_id);

      if (status === "approved") {
        const { data: payment } = await supabase.from("plan_payments").select("*").eq("id", payment_id).single();
        if (payment) {
          await supabase.from("subscriptions").update({ status: "expired" })
            .eq("user_id", payment.user_id).eq("status", "active").in("plan", ["free", "pro", "business"]);
          if (payment.plan !== "free") {
            const startDate = new Date();
            const billingType = payment.billing_type || "monthly";
            const durationDays = billingType === "yearly" ? 365 : 30;
            const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
            await supabase.from("subscriptions").insert({
              user_id: payment.user_id, plan: payment.plan, status: "active",
              product_name: `${payment.plan.charAt(0).toUpperCase() + payment.plan.slice(1)} Plan`,
              price: payment.amount, cost_price: 0, variation: "Payment Approved",
              start_date: startDate.toISOString(), end_date: endDate.toISOString(),
              store_id: payment.store_id || null, volume: payment.volume || null, billing_type: billingType,
            });
          }
          const planLabel = payment.plan.charAt(0).toUpperCase() + payment.plan.slice(1);
          await supabase.from("notifications").insert({
            user_id: payment.user_id, type: "success",
            message: `🎉 Your payment has been approved! Plan upgraded to ${planLabel}.`,
          });
        }
      } else if (status === "rejected") {
        const { data: payment } = await supabase.from("plan_payments").select("user_id").eq("id", payment_id).single();
        if (payment) {
          await supabase.from("notifications").insert({
            user_id: payment.user_id, type: "error",
            message: `Your plan payment was rejected.${admin_notes ? ` Reason: ${admin_notes}` : ""} Please contact support.`,
          });
        }
      }
      return json({ success: true });
    }

    // ─── GET PAYMENT GATEWAYS ───
    if (action === "delete_plan_payment") {
      const { payment_id } = params;
      await supabase.from("plan_payments").delete().eq("id", payment_id);
      return json({ success: true });
    }

    if (action === "bulk_delete_plan_payments") {
      const { payment_ids } = params;
      if (!Array.isArray(payment_ids) || payment_ids.length === 0) return errorResponse("No ids", 400);
      await supabase.from("plan_payments").delete().in("id", payment_ids);
      return json({ success: true, count: payment_ids.length });
    }

    if (action === "get_payment_gateways") {
      const { data } = await supabase.from("payment_gateways").select("*").order("sort_order", { ascending: true });
      return json(data || []);
    }

    // ─── CREATE PAYMENT GATEWAY ───
    if (action === "create_payment_gateway") {
      const { currency, gateway_name, gateway_type, qr_code_url, payment_details, is_active, sort_order, mode, api_config, icon_url, required_fields } = params;
      const { error } = await supabase.from("payment_gateways").insert({
        currency, gateway_name, gateway_type, qr_code_url: qr_code_url || "",
        payment_details: payment_details || {}, is_active: is_active ?? true,
        sort_order: sort_order || 0, mode: mode || "manual",
        api_config: api_config || {}, icon_url: icon_url || "",
        required_fields: Array.isArray(required_fields) ? required_fields : [],
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
      const { data } = await supabase.from("auto_payment_logs").select("*").order("created_at", { ascending: false }).limit(500);
      return json(data || []);
    }

    // ─── GET COUPONS ───
    if (action === "get_coupons") {
      const { data } = await supabase.from("platform_coupons").select("*").order("created_at", { ascending: false });
      return json(data || []);
    }

    // ─── CREATE COUPON ───
    if (action === "create_coupon") {
      const { code, discount_type, discount_value, expires_at, max_uses, is_active } = params;
      const { error } = await supabase.from("platform_coupons").insert({
        code, discount_type, discount_value, expires_at, max_uses: max_uses || 0, is_active: is_active ?? true,
      });
      if (error) throw error;
      return json({ success: true });
    }

    // ─── UPDATE COUPON ───
    if (action === "update_coupon") {
      const { coupon_id, ...updates } = params;
      const { error } = await supabase.from("platform_coupons").update(updates).eq("id", coupon_id);
      if (error) throw error;
      return json({ success: true });
    }

    // ─── DELETE COUPON ───
    if (action === "delete_coupon") {
      const { error } = await supabase.from("platform_coupons").delete().eq("id", params.coupon_id);
      if (error) throw error;
      return json({ success: true });
    }

    // ─── GET ANALYTICS TRENDS ───
    if (action === "get_analytics_trends") {
      const days = Number(params.days) || 7;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      since.setHours(0, 0, 0, 0);
      const { data: orders } = await supabase
        .from("orders")
        .select("total_amount, created_at")
        .gte("created_at", since.toISOString());

      const buckets: Record<string, { date: string; orders: number; revenue: number }> = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        buckets[key] = { date: key, orders: 0, revenue: 0 };
      }
      (orders || []).forEach((o: any) => {
        const key = new Date(o.created_at).toISOString().slice(0, 10);
        if (buckets[key]) {
          buckets[key].orders += 1;
          buckets[key].revenue += Number(o.total_amount) || 0;
        }
      });
      return json(Object.values(buckets));
    }

    // ─── SUSPEND USER ───
    if (action === "suspend_user") {
      const { user_id: targetUserId, reason } = params;
      if (!targetUserId) return errorResponse("user_id required");

      // Update profile flag
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          is_suspended: true,
          suspended_at: new Date().toISOString(),
          suspended_reason: reason || null,
        })
        .eq("id", targetUserId);
      if (profileErr) throw profileErr;

      // Deactivate all owner stores → blocks staff via existing store_id checks
      await supabase.from("stores").update({ is_active: false }).eq("user_id", targetUserId);

      // Deactivate all staff under this owner
      await supabase.from("staff_members").update({ is_active: false }).eq("user_id", targetUserId);

      // Force sign-out of owner via Auth Admin API (revoke refresh tokens)
      try { await supabase.auth.admin.signOut(targetUserId, "global"); } catch (_e) { /* ignore */ }

      // Force sign-out of all staff auth users for that owner
      const { data: staffRows } = await supabase
        .from("staff_members")
        .select("auth_user_id")
        .eq("user_id", targetUserId)
        .not("auth_user_id", "is", null);
      for (const s of staffRows || []) {
        try { await supabase.auth.admin.signOut(s.auth_user_id as string, "global"); } catch (_e) { /* ignore */ }
      }

      await supabase.from("notifications").insert({
        user_id: targetUserId,
        type: "error",
        message: `🚫 Your account has been suspended by admin.${reason ? " Reason: " + reason : ""}`,
      });

      return json({ success: true });
    }

    // ─── UNSUSPEND USER ───
    if (action === "unsuspend_user") {
      const { user_id: targetUserId } = params;
      if (!targetUserId) return errorResponse("user_id required");

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ is_suspended: false, suspended_at: null, suspended_reason: null })
        .eq("id", targetUserId);
      if (profileErr) throw profileErr;

      await supabase.from("stores").update({ is_active: true }).eq("user_id", targetUserId);
      await supabase.from("staff_members").update({ is_active: true }).eq("user_id", targetUserId);

      await supabase.from("notifications").insert({
        user_id: targetUserId,
        type: "success",
        message: "✅ Your account has been reactivated by admin.",
      });

      return json({ success: true });
    }

    // ─── DELETE USER (full cascade) ───
    if (action === "delete_user") {
      const { user_id: targetUserId, confirm } = params;
      if (!targetUserId) return errorResponse("user_id required");
      if (confirm !== "DELETE") return errorResponse("Confirmation token missing");
      if (targetUserId === user.id) return errorResponse("You cannot delete your own account");

      // Collect store ids
      const { data: storeRows } = await supabase.from("stores").select("id").eq("user_id", targetUserId);
      const storeIds = (storeRows || []).map((s: any) => s.id);

      // Collect staff auth users to remove from auth as well
      const { data: staffRows } = await supabase
        .from("staff_members")
        .select("auth_user_id")
        .eq("user_id", targetUserId)
        .not("auth_user_id", "is", null);
      const staffAuthIds = (staffRows || []).map((s: any) => s.auth_user_id as string);

      // Helper to delete by user_id
      const tablesByUser = [
        "ad_costs", "ads_accounts", "ads_metrics", "auto_payment_logs", "bot_automations",
        "business_settings", "cash_register_shifts", "coupons", "credit_payments",
        "customer_credits", "customers", "email_branding", "email_campaign_tracking",
        "email_config", "email_store_config", "email_templates", "google_sheets_config",
        "integrations", "loyalty_points", "loyalty_transactions", "meta_ad_accounts",
        "notification_logs", "notifications", "order_forms", "plan_history", "plan_payments",
        "purchases", "referral_settings", "referral_withdrawals", "refunds",
        "renewal_automation_config", "renewal_email_templates", "renewal_reminders",
        "staff_members", "subscriptions", "suppliers",
      ];

      // Delete order_items first (depends on orders)
      const { data: orderRows } = await supabase.from("orders").select("id").eq("user_id", targetUserId);
      const orderIds = (orderRows || []).map((o: any) => o.id);
      if (orderIds.length > 0) {
        await supabase.from("order_items").delete().in("order_id", orderIds);
      }

      // Delete purchase_items
      const { data: purchaseRows } = await supabase.from("purchases").select("id").eq("user_id", targetUserId);
      const purchaseIds = (purchaseRows || []).map((p: any) => p.id);
      if (purchaseIds.length > 0) {
        await supabase.from("purchase_items").delete().in("purchase_id", purchaseIds);
      }

      // Delete product_variations
      const { data: prodRows } = await supabase.from("products").select("id").eq("user_id", targetUserId);
      const prodIds = (prodRows || []).map((p: any) => p.id);
      if (prodIds.length > 0) {
        await supabase.from("product_variations").delete().in("product_id", prodIds);
      }

      // Now wipe orders, products
      await supabase.from("orders").delete().eq("user_id", targetUserId);
      await supabase.from("products").delete().eq("user_id", targetUserId);

      // Wipe everything else by user_id
      for (const t of tablesByUser) {
        try { await supabase.from(t).delete().eq("user_id", targetUserId); } catch (_e) { /* ignore */ }
      }

      // Delete stores last
      if (storeIds.length > 0) {
        await supabase.from("stores").delete().in("id", storeIds);
      }

      // Delete user_roles & profile
      await supabase.from("user_roles").delete().eq("user_id", targetUserId);
      await supabase.from("profiles").delete().eq("id", targetUserId);

      // Delete staff auth users
      for (const aid of staffAuthIds) {
        try { await supabase.auth.admin.deleteUser(aid); } catch (_e) { /* ignore */ }
      }

      // Finally, delete the auth user
      try { await supabase.auth.admin.deleteUser(targetUserId); } catch (_e) { /* ignore */ }

      return json({ success: true });
    }

    // ─── GET USER HIERARCHY (Owner → Stores → Staff) ───
    if (action === "get_user_hierarchy") {
      const [profilesRes, storesRes, staffRes, subsRes] = await Promise.all([
        supabase.from("profiles").select("id, name, email, created_at, is_suspended, suspended_at, suspended_reason").order("created_at", { ascending: false }),
        supabase.from("stores").select("id, name, user_id, is_active, created_at"),
        supabase.from("staff_members").select("id, user_id, store_id, name, email, phone, role, is_active, auth_user_id, created_at"),
        supabase.from("subscriptions").select("user_id, plan, status, end_date").eq("status", "active").in("plan", ["free", "pro", "business"]),
      ]);

      const profiles = profilesRes.data || [];
      const stores = storesRes.data || [];
      const staff = staffRes.data || [];
      const subs = subsRes.data || [];

      // Best plan per user
      const levels: Record<string, number> = { free: 0, pro: 1, business: 2 };
      const planMap: Record<string, { plan: string; end_date: string | null }> = {};
      subs.forEach((s: any) => {
        const cur = planMap[s.user_id];
        if (!cur || (levels[s.plan] || 0) > (levels[cur.plan] || 0)) {
          planMap[s.user_id] = { plan: s.plan, end_date: s.end_date };
        }
      });

      // Auth users map → password_status (whether they have an encrypted_password set)
      const authMap: Record<string, { has_password: boolean; last_sign_in_at: string | null }> = {};
      try {
        let page = 1;
        while (true) {
          const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) break;
          for (const u of data.users || []) {
            authMap[u.id] = {
              has_password: !!(u as any).encrypted_password || (u.identities || []).some((i: any) => i.provider === "email"),
              last_sign_in_at: u.last_sign_in_at || null,
            };
          }
          if (!data.users || data.users.length < 1000) break;
          page++;
          if (page > 20) break;
        }
      } catch (_e) { /* ignore */ }

      // Group stores by owner, staff by store
      const storesByOwner: Record<string, any[]> = {};
      stores.forEach((s: any) => {
        (storesByOwner[s.user_id] ||= []).push(s);
      });
      const staffByStore: Record<string, any[]> = {};
      const staffByOwnerNoStore: Record<string, any[]> = {};
      staff.forEach((m: any) => {
        if (m.store_id) (staffByStore[m.store_id] ||= []).push(m);
        else (staffByOwnerNoStore[m.user_id] ||= []).push(m);
      });

      const result = profiles.map((p: any) => {
        const ownerPlan = planMap[p.id]?.plan || "free";
        const ownerEnd = planMap[p.id]?.end_date || null;
        const ownerStores = (storesByOwner[p.id] || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          is_active: s.is_active,
          created_at: s.created_at,
          staff: (staffByStore[s.id] || []).map((m: any) => ({
            id: m.id,
            auth_user_id: m.auth_user_id,
            name: m.name,
            email: m.email,
            phone: m.phone,
            role: m.role,
            is_active: m.is_active,
            password_set: m.auth_user_id ? !!authMap[m.auth_user_id]?.has_password : false,
            last_sign_in_at: m.auth_user_id ? authMap[m.auth_user_id]?.last_sign_in_at || null : null,
          })),
        }));
        return {
          id: p.id,
          name: p.name,
          email: p.email,
          created_at: p.created_at,
          is_suspended: !!p.is_suspended,
          suspended_at: p.suspended_at || null,
          suspended_reason: p.suspended_reason || null,
          plan: ownerPlan,
          plan_end_date: ownerEnd,
          password_set: !!authMap[p.id]?.has_password,
          last_sign_in_at: authMap[p.id]?.last_sign_in_at || null,
          stores: ownerStores,
          unassigned_staff: (staffByOwnerNoStore[p.id] || []).map((m: any) => ({
            id: m.id,
            auth_user_id: m.auth_user_id,
            name: m.name,
            email: m.email,
            phone: m.phone,
            role: m.role,
            is_active: m.is_active,
            password_set: m.auth_user_id ? !!authMap[m.auth_user_id]?.has_password : false,
            last_sign_in_at: m.auth_user_id ? authMap[m.auth_user_id]?.last_sign_in_at || null : null,
          })),
        };
      });

      return json(result);
    }

    // ─── RESET USER PASSWORD (generate recovery link, never expose plain password) ───
    if (action === "reset_user_password") {
      const { email } = params;
      if (!email) return errorResponse("email required");

      // Always use the canonical custom domain for password reset links
      const redirectTo = "https://evixpos.com/reset-password";

      const { data, error } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      if (error) return errorResponse(error.message);

      return json({
        success: true,
        action_link: (data as any)?.properties?.action_link || null,
        email,
      });
    }

    // ─────────────────────────────────────────────────
    // PHASE 1: Audit Log / Broadcasts / Maintenance / Impersonate
    // ─────────────────────────────────────────────────

    // Helper: write an audit log entry (best-effort, never throws)
    const logAction = async (act: string, target_type = "", target_id = "", target_label = "", details: Record<string, unknown> = {}) => {
      try {
        await supabase.from("admin_audit_logs").insert({
          admin_id: user.id,
          admin_email: user.email || "",
          action: act,
          target_type,
          target_id,
          target_label,
          details,
          ip_address: req.headers.get("x-forwarded-for") || "",
          user_agent: req.headers.get("user-agent") || "",
        });
      } catch (_) { /* swallow */ }
    };

    // ─── AUDIT LOGS ───
    if (action === "get_audit_logs") {
      const { search = "", action_filter = "", limit = 200 } = params;
      let q = supabase.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(Number(limit));
      if (action_filter) q = q.eq("action", action_filter);
      if (search) q = q.or(`admin_email.ilike.%${search}%,target_label.ilike.%${search}%,action.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) return errorResponse(error.message);
      return json(data || []);
    }

    if (action === "log_admin_action") {
      const { act, target_type = "", target_id = "", target_label = "", details = {} } = params;
      if (!act) return errorResponse("act required");
      await logAction(act, target_type, target_id, target_label, details);
      return json({ success: true });
    }

    // ─── ADMIN PLAN OVERRIDES ───
    if (action === "get_user_override") {
      const { user_id: targetUserId } = params;
      if (!targetUserId) return errorResponse("user_id required");
      const { data } = await supabase
        .from("admin_plan_overrides")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();
      return json(data || null);
    }

    if (action === "admin_set_overrides") {
      const {
        user_id: targetUserId,
        manual_override = false,
        is_unlimited_store = false,
        is_unlimited_customer = false,
        is_unlimited_product = false,
        override_volume = null,
        override_max_stores = null,
        override_max_products = null,
        override_max_customers = null,
        notes = null,
      } = params;
      if (!targetUserId) return errorResponse("user_id required");

      const payload = {
        user_id: targetUserId,
        manual_override: !!manual_override,
        is_unlimited_store: !!is_unlimited_store,
        is_unlimited_customer: !!is_unlimited_customer,
        is_unlimited_product: !!is_unlimited_product,
        override_volume: override_volume === "" || override_volume == null ? null : Number(override_volume),
        override_max_stores: override_max_stores === "" || override_max_stores == null ? null : Number(override_max_stores),
        override_max_products: override_max_products === "" || override_max_products == null ? null : Number(override_max_products),
        override_max_customers: override_max_customers === "" || override_max_customers == null ? null : Number(override_max_customers),
        notes,
        applied_by: user.id,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("admin_plan_overrides")
        .upsert(payload, { onConflict: "user_id" });
      if (error) return errorResponse(error.message);

      await logAction("admin_set_overrides", "user", targetUserId, targetUserId, payload);

      await supabase.from("notifications").insert({
        user_id: targetUserId,
        type: "system",
        message: manual_override
          ? "⚙️ An admin has applied custom limits to your account."
          : "⚙️ An admin has reset your account to standard plan limits.",
      });

      return json({ success: true });
    }

    if (action === "admin_clear_overrides") {
      const { user_id: targetUserId } = params;
      if (!targetUserId) return errorResponse("user_id required");
      const { error } = await supabase
        .from("admin_plan_overrides")
        .delete()
        .eq("user_id", targetUserId);
      if (error) return errorResponse(error.message);
      await logAction("admin_clear_overrides", "user", targetUserId, targetUserId);
      return json({ success: true });
    }

    // ─── BROADCASTS ───
    if (action === "get_broadcasts") {
      const { data, error } = await supabase.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) return errorResponse(error.message);
      return json(data || []);
    }

    if (action === "send_broadcast") {
      const { title = "", message = "", target_type = "all", target_value = "", channel = "in_app" } = params;
      if (!title || !message) return errorResponse("title and message required");

      // Resolve recipient user_ids
      let recipientIds: string[] = [];
      if (target_type === "all") {
        const { data } = await supabase.from("profiles").select("id");
        recipientIds = (data || []).map((p: any) => p.id);
      } else if (target_type === "suspended") {
        const { data } = await supabase.from("profiles").select("id").eq("is_suspended", true);
        recipientIds = (data || []).map((p: any) => p.id);
      } else if (target_type === "active") {
        const { data } = await supabase.from("profiles").select("id").eq("is_suspended", false);
        recipientIds = (data || []).map((p: any) => p.id);
      } else if (target_type === "plan") {
        const { data } = await supabase.from("subscriptions").select("user_id").eq("plan", target_value).eq("status", "active");
        recipientIds = Array.from(new Set((data || []).map((s: any) => s.user_id).filter(Boolean)));
      } else if (target_type === "user" && target_value) {
        recipientIds = [target_value];
      }

      // Insert in-app notifications in batches
      if (channel === "in_app" || channel === "both") {
        const rows = recipientIds.map((uid) => ({
          user_id: uid,
          title,
          message,
          type: "broadcast",
          is_read: false,
        }));
        // Insert in chunks of 500
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          if (chunk.length > 0) {
            await supabase.from("notifications").insert(chunk);
          }
        }
      }

      // Record the broadcast
      const { data: bc, error: bcErr } = await supabase.from("broadcasts").insert({
        admin_id: user.id,
        title,
        message,
        target_type,
        target_value,
        channel,
        status: "sent",
        sent_at: new Date().toISOString(),
        recipients_count: recipientIds.length,
      }).select().single();
      if (bcErr) return errorResponse(bcErr.message);

      await logAction("send_broadcast", "broadcast", bc.id, title, { recipients: recipientIds.length, target_type, target_value });
      return json({ success: true, broadcast: bc, recipients: recipientIds.length });
    }

    if (action === "delete_broadcast") {
      const { id } = params;
      if (!id) return errorResponse("id required");
      const { error } = await supabase.from("broadcasts").delete().eq("id", id);
      if (error) return errorResponse(error.message);
      await logAction("delete_broadcast", "broadcast", id);
      return json({ success: true });
    }

    // ─── MAINTENANCE MODE / SYSTEM SETTINGS ───
    if (action === "get_system_setting") {
      const { key } = params;
      if (!key) return errorResponse("key required");
      const { data, error } = await supabase.from("system_settings").select("*").eq("key", key).maybeSingle();
      if (error) return errorResponse(error.message);
      return json(data);
    }

    if (action === "update_system_setting") {
      const { key, value, description } = params;
      if (!key) return errorResponse("key required");
      const { data, error } = await supabase.from("system_settings")
        .upsert({ key, value, description: description || "", updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "key" })
        .select().single();
      if (error) return errorResponse(error.message);
      await logAction("update_system_setting", "system_setting", key, key, { value });
      return json(data);
    }

    // ─── IMPERSONATE USER (generate magic link) ───
    if (action === "impersonate_user") {
      const { target_user_id, reason = "" } = params;
      if (!target_user_id) return errorResponse("target_user_id required");

      // Get target user email
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", target_user_id).maybeSingle();
      if (!profile?.email) return errorResponse("Target user not found");

      // Generate magic link
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: profile.email,
        options: { redirectTo: "https://evixpos.com/dashboard" },
      });
      if (linkErr) return errorResponse(linkErr.message);

      // Record the impersonation session
      await supabase.from("impersonation_sessions").insert({
        admin_id: user.id,
        target_user_id,
        target_email: profile.email,
        reason,
        is_active: true,
      });

      await logAction("impersonate_user", "user", target_user_id, profile.email, { reason });

      return json({
        success: true,
        action_link: (linkData as any)?.properties?.action_link || null,
        email: profile.email,
      });
    }

    if (action === "get_impersonation_sessions") {
      const { data, error } = await supabase.from("impersonation_sessions").select("*").order("started_at", { ascending: false }).limit(100);
      if (error) return errorResponse(error.message);
      return json(data || []);
    }

    // ─── FEATURE FLAGS ───
    if (action === "get_feature_flags") {
      const { data, error } = await supabase.from("feature_flags").select("*").order("flag_key");
      if (error) return errorResponse(error.message);
      return json(data || []);
    }

    if (action === "update_feature_flag") {
      const { id, enabled, allowed_plans, label, description } = params;
      if (!id) return errorResponse("id required");
      const patch: any = { updated_at: new Date().toISOString() };
      if (typeof enabled === "boolean") patch.enabled = enabled;
      if (Array.isArray(allowed_plans)) patch.allowed_plans = allowed_plans;
      if (typeof label === "string") patch.label = label;
      if (typeof description === "string") patch.description = description;
      const { data, error } = await supabase.from("feature_flags").update(patch).eq("id", id).select().single();
      if (error) return errorResponse(error.message);
      await logAction("update_feature_flag", "feature_flag", id, data?.flag_key, patch);
      return json(data);
    }

    // ─── SYSTEM TEMPLATES ───
    if (action === "get_system_templates") {
      const { data, error } = await supabase.from("system_templates").select("*").order("template_key");
      if (error) return errorResponse(error.message);
      return json(data || []);
    }

    if (action === "update_system_template") {
      const { id, subject, body: tplBody, is_active, label } = params;
      if (!id) return errorResponse("id required");
      const patch: any = { updated_at: new Date().toISOString() };
      if (typeof subject === "string") patch.subject = subject;
      if (typeof tplBody === "string") patch.body = tplBody;
      if (typeof is_active === "boolean") patch.is_active = is_active;
      if (typeof label === "string") patch.label = label;
      const { data, error } = await supabase.from("system_templates").update(patch).eq("id", id).select().single();
      if (error) return errorResponse(error.message);
      await logAction("update_system_template", "system_template", id, data?.template_key, patch);
      return json(data);
    }

    // ─── FINANCE METRICS (MRR/ARR/Churn/Revenue trend) ───
    if (action === "get_finance_metrics") {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

      // Active subs by plan
      const { data: subs } = await supabase.from("subscriptions").select("plan, status, start_date, end_date").eq("status", "active");
      const planCounts: Record<string, number> = { free: 0, pro: 0, business: 0 };
      (subs || []).forEach((s: any) => { if (s.plan in planCounts) planCounts[s.plan]++; });

      // Pull plan prices (use lowest tier as approximation)
      const { data: planConfigs } = await supabase.from("plans_config").select("plan_type, price_inr, volume").order("volume");
      const proPrice = planConfigs?.find((p: any) => p.plan_type === "pro")?.price_inr || 349;
      const bizPrice = planConfigs?.find((p: any) => p.plan_type === "business")?.price_inr || 449;

      const mrr = planCounts.pro * proPrice + planCounts.business * bizPrice;
      const arr = mrr * 12;

      // Approved payments last 30 vs 60 days for revenue trend
      const { data: recentPayments } = await supabase
        .from("plan_payments")
        .select("amount, currency, status, created_at")
        .eq("status", "approved")
        .gte("created_at", sixtyDaysAgo);
      let revenue30 = 0, revenuePrev30 = 0;
      (recentPayments || []).forEach((p: any) => {
        const t = new Date(p.created_at).getTime();
        if (t >= new Date(thirtyDaysAgo).getTime()) revenue30 += Number(p.amount);
        else revenuePrev30 += Number(p.amount);
      });

      // Churn = expired subs in last 30d / active 30d ago
      const { count: expiredCount } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "expired")
        .gte("end_date", thirtyDaysAgo);
      const totalActive = planCounts.pro + planCounts.business;
      const churnRate = totalActive > 0 ? ((expiredCount || 0) / totalActive) * 100 : 0;

      // Failed payments
      const { count: failedPayments } = await supabase
        .from("plan_payments")
        .select("id", { count: "exact", head: true })
        .eq("status", "rejected")
        .gte("created_at", thirtyDaysAgo);

      // Refunds last 30d
      const { data: refunds } = await supabase.from("refunds").select("refund_amount").gte("created_at", thirtyDaysAgo);
      const refundTotal = (refunds || []).reduce((s: number, r: any) => s + Number(r.refund_amount || 0), 0);

      // Upcoming renewals (next 7 days)
      const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: upcomingRenewals } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .lte("end_date", sevenDaysAhead)
        .gte("end_date", now.toISOString());

      return json({
        mrr,
        arr,
        planCounts,
        revenue30,
        revenuePrev30,
        revenueGrowthPct: revenuePrev30 > 0 ? ((revenue30 - revenuePrev30) / revenuePrev30) * 100 : 0,
        churnRate,
        failedPayments: failedPayments || 0,
        refundTotal,
        upcomingRenewals: upcomingRenewals || 0,
      });
    }

    // ─── PHASE 3: ADMIN ROLES MANAGEMENT ───
    if (action === "list_admin_roles") {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role")
        .in("role", ["admin","super_admin","support_admin","finance_admin"]);
      if (error) return errorResponse(error.message);
      const ids = (data || []).map((r: any) => r.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, email, name").in("id", ids)
        : { data: [] };
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const merged = (data || []).map((r: any) => ({ ...r, ...(profileMap.get(r.user_id) || {}) }));
      return json(merged);
    }

    if (action === "set_user_role") {
      const { user_id, role } = params as { user_id: string; role: string };
      if (!user_id || !role) return errorResponse("user_id and role required");
      if (!["admin","super_admin","support_admin","finance_admin"].includes(role)) {
        return errorResponse("Invalid admin role");
      }
      const { error } = await supabase.from("user_roles").upsert({ user_id, role }, { onConflict: "user_id,role" });
      if (error) return errorResponse(error.message);
      const { data: prof } = await supabase.from("profiles").select("email").eq("id", user_id).maybeSingle();
      await logAction("set_user_role", "user", user_id, prof?.email || "", { role });
      return json({ success: true });
    }

    if (action === "remove_user_role") {
      const { user_id, role } = params as { user_id: string; role: string };
      if (!user_id || !role) return errorResponse("user_id and role required");
      const { error } = await supabase.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
      if (error) return errorResponse(error.message);
      await logAction("remove_user_role", "user", user_id, "", { role });
      return json({ success: true });
    }

    // ─── PHASE 3: LIVE ACTIVITY FEED ───
    if (action === "get_activity_feed") {
      const { limit = 100, event_type } = params as { limit?: number; event_type?: string };
      let q = supabase.from("admin_activity_feed").select("*").order("created_at", { ascending: false }).limit(Number(limit));
      if (event_type) q = q.eq("event_type", event_type);
      const { data, error } = await q;
      if (error) return errorResponse(error.message);
      return json(data || []);
    }

    if (action === "get_activity_stats") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const types = ["signup","order","payment"];
      const counts: Record<string, number> = {};
      for (const t of types) {
        const { count } = await supabase
          .from("admin_activity_feed")
          .select("id", { count: "exact", head: true })
          .eq("event_type", t)
          .gte("created_at", since);
        counts[t] = count || 0;
      }
      return json({ last_24h: counts });
    }

    // ─── PHASE 3: DATA EXPORT (CSV/JSON) ───
    if (action === "export_data") {
      const { dataset, format = "csv" } = params as { dataset: string; format?: "csv" | "json" };
      const allowed: Record<string, { table: string; columns: string }> = {
        users: { table: "profiles", columns: "id, email, name, created_at, is_suspended" },
        stores: { table: "stores", columns: "*" },
        payments: { table: "plan_payments", columns: "id, user_id, plan, amount, currency, status, created_at, transaction_id" },
        orders: { table: "orders", columns: "id, user_id, store_id, total_amount, payment_status, status, created_at" },
        subscriptions: { table: "subscriptions", columns: "*" },
      };
      const cfg = allowed[dataset];
      if (!cfg) return errorResponse("Invalid dataset");
      // Tier-restricted exports
      if (!isSuperAdmin && !can("admin")) {
        const financeOnly = ["payments","subscriptions"];
        const supportOnly = ["users","stores","orders"];
        if (can("finance_admin") && !financeOnly.includes(dataset)) {
          return errorResponse("Finance role can only export payments/subscriptions");
        }
        if (can("support_admin") && !supportOnly.includes(dataset)) {
          return errorResponse("Support role can only export users/stores/orders");
        }
      }
      const { data, error } = await supabase.from(cfg.table).select(cfg.columns).limit(10000);
      if (error) return errorResponse(error.message);
      const rows = (data as any[]) || [];

      await logAction("export_data", "dataset", dataset, dataset, { format, count: rows.length });

      if (format === "json") {
        return new Response(JSON.stringify(rows, null, 2), {
          headers: { ...corsHeaders, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${dataset}.json"` },
        });
      }
      if (rows.length === 0) {
        return new Response("", { headers: { ...corsHeaders, "Content-Type": "text/csv" } });
      }
      const headers = Object.keys(rows[0]);
      const escape = (v: any) => {
        if (v === null || v === undefined) return "";
        const s = typeof v === "object" ? JSON.stringify(v) : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
      return new Response(csv, {
        headers: { ...corsHeaders, "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${dataset}.csv"` },
      });
    }

    if (action === "get_admin_context") {
      return json({ roles: adminRoles, isSuperAdmin });
    }

    // ─── UNKNOWN ACTION ───
    return errorResponse(`Unknown action: ${action}`);
  } catch (err: any) {
    return errorResponse(err.message || "Internal error");
  }
});
