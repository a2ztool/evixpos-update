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

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) return errorResponse("Not an admin", 403);

    const body = await req.json();
    const action = body.action;
    const params = body.params || {};

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
        const { id, plan_type, volume, price_inr, store_limit, product_limit, customer_limit } = row;
        if (id) {
          await supabase.from("plans_config").update({
            price_inr, store_limit, product_limit, customer_limit, updated_at: new Date().toISOString(),
          }).eq("id", id);
        } else {
          await supabase.from("plans_config").upsert({
            plan_type, volume, price_inr, store_limit, product_limit, customer_limit, updated_at: new Date().toISOString(),
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

      const result = (payments || []).map((p: any) => ({
        ...p, gateway_name: p.payment_gateways?.gateway_name || "",
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

      const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, "") || "";
      const redirectTo = origin ? `${origin}/reset-password` : undefined;

      const { data, error } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (error) return errorResponse(error.message);

      return json({
        success: true,
        action_link: (data as any)?.properties?.action_link || null,
        email,
      });
    }

    // ─── UNKNOWN ACTION ───
    return errorResponse(`Unknown action: ${action}`);
  } catch (err: any) {
    return errorResponse(err.message || "Internal error");
  }
});
