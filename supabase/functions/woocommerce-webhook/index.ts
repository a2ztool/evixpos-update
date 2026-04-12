import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const url = new URL(req.url);
    const integrationId = url.searchParams.get("integration_id");

    if (!integrationId) {
      return new Response(JSON.stringify({ error: "Missing integration_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get integration details
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .single();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "Integration not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (integration.status !== "active") {
      return new Response(JSON.stringify({ error: "Integration inactive" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // WooCommerce sends different webhook topics
    // We handle order.created and order.updated
    if (!body || !body.id) {
      // Ping/test webhook — just return 200
      return new Response(JSON.stringify({ success: true, message: "Webhook received" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wcOrder = body;
    const userId = integration.user_id;
    const storeId = integration.store_id;

    // Map WooCommerce status to our status
    const statusMap: Record<string, string> = {
      pending: "pending",
      processing: "pending",
      "on-hold": "pending",
      completed: "completed",
      cancelled: "cancelled",
      refunded: "cancelled",
      failed: "cancelled",
    };

    const paymentStatusMap: Record<string, string> = {
      pending: "unpaid",
      processing: "unpaid",
      "on-hold": "unpaid",
      completed: "paid",
      cancelled: "unpaid",
      refunded: "refunded",
      failed: "unpaid",
    };

    const wcStatus = wcOrder.status || "pending";
    const orderStatus = statusMap[wcStatus] || "pending";
    const paymentStatus = paymentStatusMap[wcStatus] || "unpaid";

    // Build customer info
    const billing = wcOrder.billing || {};
    const shipping = wcOrder.shipping || {};
    const customerName =
      `${billing.first_name || ""} ${billing.last_name || ""}`.trim() ||
      "WooCommerce Customer";
    const customerEmail = billing.email || "";
    const customerPhone = billing.phone || "";
    const customerAddress = [
      billing.address_1,
      billing.address_2,
      billing.city,
      billing.state,
      billing.postcode,
      billing.country,
    ]
      .filter(Boolean)
      .join(", ");

    // Find or create customer
    let customerId: string | null = null;
    if (customerEmail || customerPhone) {
      // Try to find existing customer
      let query = supabase
        .from("customers")
        .select("id")
        .eq("store_id", storeId);

      if (customerEmail) {
        query = query.eq("email", customerEmail);
      } else {
        query = query.eq("phone", customerPhone);
      }

      const { data: existingCustomer } = await query.maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer } = await supabase
          .from("customers")
          .insert({
            user_id: userId,
            store_id: storeId,
            name: customerName,
            email: customerEmail,
            phone: customerPhone,
            address: customerAddress,
            notes: `Auto-created from WooCommerce order #${wcOrder.number || wcOrder.id}`,
          })
          .select("id")
          .single();

        if (newCustomer) customerId = newCustomer.id;
      }
    }

    // Build meta object with all WooCommerce details
    const meta: Record<string, unknown> = {
      wc_order_id: wcOrder.id,
      wc_order_number: wcOrder.number,
      wc_order_key: wcOrder.order_key,
      wc_status: wcStatus,
      billing: {
        first_name: billing.first_name,
        last_name: billing.last_name,
        company: billing.company,
        address_1: billing.address_1,
        address_2: billing.address_2,
        city: billing.city,
        state: billing.state,
        postcode: billing.postcode,
        country: billing.country,
        email: billing.email,
        phone: billing.phone,
      },
      shipping: {
        first_name: shipping.first_name,
        last_name: shipping.last_name,
        company: shipping.company,
        address_1: shipping.address_1,
        address_2: shipping.address_2,
        city: shipping.city,
        state: shipping.state,
        postcode: shipping.postcode,
        country: shipping.country,
      },
      line_items: (wcOrder.line_items || []).map((item: any) => ({
        name: item.name,
        product_id: item.product_id,
        variation_id: item.variation_id,
        quantity: item.quantity,
        subtotal: item.subtotal,
        total: item.total,
        sku: item.sku,
        price: item.price,
        meta_data: item.meta_data,
      })),
      shipping_lines: wcOrder.shipping_lines || [],
      fee_lines: wcOrder.fee_lines || [],
      coupon_lines: wcOrder.coupon_lines || [],
      payment_method_title: wcOrder.payment_method_title,
      transaction_id: wcOrder.transaction_id,
      customer_note: wcOrder.customer_note,
      meta_data: wcOrder.meta_data || [],
      date_created: wcOrder.date_created,
      date_paid: wcOrder.date_paid,
    };

    const totalAmount = parseFloat(wcOrder.total) || 0;
    const discount =
      parseFloat(wcOrder.discount_total) || 0;
    const currency = (wcOrder.currency || "BDT").toUpperCase();

    // Build notes
    const notesParts: string[] = [];
    if (wcOrder.customer_note) notesParts.push(`Customer note: ${wcOrder.customer_note}`);
    notesParts.push(`WooCommerce Order #${wcOrder.number || wcOrder.id}`);

    // Check if order already exists (by wc_order_id in meta)
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("store_id", storeId)
      .eq("source", "woocommerce")
      .filter("meta->>wc_order_id", "eq", String(wcOrder.id))
      .maybeSingle();

    if (existingOrder) {
      // Update existing order
      await supabase
        .from("orders")
        .update({
          total_amount: totalAmount,
          discount,
          discount_type: "fixed",
          payment_method: wcOrder.payment_method || "online",
          payment_status: paymentStatus,
          payment_currency: currency,
          status: orderStatus,
          notes: notesParts.join("\n"),
          meta,
          customer_id: customerId,
        })
        .eq("id", existingOrder.id);

      return new Response(
        JSON.stringify({ success: true, action: "updated", order_id: existingOrder.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create new order
    const { data: newOrder, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        store_id: storeId,
        customer_id: customerId,
        total_amount: totalAmount,
        cost_price: 0,
        discount,
        discount_type: "fixed",
        payment_method: wcOrder.payment_method || "online",
        source: "woocommerce",
        payment_currency: currency,
        payment_status: paymentStatus,
        status: orderStatus,
        notes: notesParts.join("\n"),
        meta,
      })
      .select("id")
      .single();

    if (orderError) {
      console.error("Order insert error:", orderError);
      return new Response(
        JSON.stringify({ error: orderError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert order items from WooCommerce line items
    if (wcOrder.line_items && wcOrder.line_items.length > 0 && newOrder) {
      const orderItems = wcOrder.line_items.map((item: any) => ({
        order_id: newOrder.id,
        product_id: null, // WooCommerce products aren't mapped 1:1
        quantity: item.quantity || 1,
        price: parseFloat(item.price) || 0,
      }));

      await supabase.from("order_items").insert(orderItems);
    }

    // Create notification for the store owner
    const itemNames = (wcOrder.line_items || [])
      .map((i: any) => i.name)
      .slice(0, 3)
      .join(", ");
    const notifMessage = `🛒 New website order #${wcOrder.number || wcOrder.id} from ${customerName} — ${currency} ${totalAmount.toFixed(2)}${itemNames ? ` (${itemNames})` : ""}`;

    await supabase.from("notifications").insert({
      user_id: userId,
      message: notifMessage,
      type: "order",
    });

    return new Response(
      JSON.stringify({ success: true, action: "created", order_id: newOrder?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
