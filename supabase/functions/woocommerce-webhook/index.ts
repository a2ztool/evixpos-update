import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Helper: sync a single WC product into our DB ──
async function syncSingleProduct(
  supabase: any, userId: string, storeId: string,
  wcp: any, storeUrl: string, consumerKey: string, consumerSecret: string
) {
  const category = wcp.categories?.[0]?.name || "";
  const imageUrl = wcp.images?.[0]?.src || "";
  const price = parseFloat(wcp.price) || parseFloat(wcp.regular_price) || 0;
  const stock = wcp.stock_quantity ?? 0;
  const isVariable = wcp.type === "variable";
  const productType = wcp.type === "virtual" ? "digital" : "physical";
  const wcIdentifier = `wc_id:${wcp.id}`;

  const { data: existingProduct } = await supabase
    .from("products").select("id").eq("store_id", storeId).eq("sku", wcIdentifier).maybeSingle();

  let productId: string;
  if (existingProduct) {
    await supabase.from("products").update({
      name: wcp.name, price, stock, image_url: imageUrl, category,
      type: productType, is_active: true,
      description: wcp.short_description || wcp.description || "",
    }).eq("id", existingProduct.id);
    productId = existingProduct.id;
  } else {
    const { data: newProduct, error } = await supabase.from("products").insert({
      user_id: userId, store_id: storeId, name: wcp.name, price, stock,
      image_url: imageUrl, category, type: productType, is_active: true,
      sku: wcIdentifier, base_cost: 0, description: wcp.short_description || wcp.description || "",
    }).select("id").single();
    if (error || !newProduct) return;
    productId = newProduct.id;
  }

  // Sync variations if variable product
  if (isVariable) {
    // Fetch variations from WC API
    const url = new URL(`${storeUrl}/wp-json/wc/v3/products/${wcp.id}/variations`);
    url.searchParams.set("consumer_key", consumerKey);
    url.searchParams.set("consumer_secret", consumerSecret);
    url.searchParams.set("per_page", "100");
    const res = await fetch(url.toString());
    if (res.ok) {
      const wcVariations = await res.json();
      const wcVarIds: number[] = [];
      for (let idx = 0; idx < wcVariations.length; idx++) {
        const wcv = wcVariations[idx];
        wcVarIds.push(wcv.id);
        const varName = wcv.attributes?.map((a: any) => a.option).join(" / ") || `Variation ${wcv.id}`;
        const varPrice = parseFloat(wcv.price) || parseFloat(wcv.regular_price) || 0;
        const varStock = wcv.stock_quantity ?? 0;
        const displayName = `${varName} [wc:${wcv.id}]`;

        const { data: existingVar } = await (supabase
          .from("product_variations" as any).select("id")
          .eq("product_id", productId).like("name", `%[wc:${wcv.id}]%`) as any).maybeSingle();

        if (existingVar) {
          await (supabase.from("product_variations" as any).update({
            name: displayName, price: varPrice, stock: varStock, sort_order: idx,
          }) as any).eq("id", existingVar.id);
        } else {
          await (supabase.from("product_variations" as any).insert({
            product_id: productId, name: displayName, price: varPrice,
            stock: varStock, sort_order: idx, is_subscription: false, duration_days: 0,
          }) as any);
        }
      }
      // Remove deleted variations
      const { data: allLocalVars } = await (supabase
        .from("product_variations" as any).select("id, name")
        .eq("product_id", productId) as any);
      if (allLocalVars) {
        for (const lv of allLocalVars) {
          const match = (lv.name as string).match(/\[wc:(\d+)\]/);
          if (match && !wcVarIds.includes(Number(match[1]))) {
            await (supabase.from("product_variations" as any).delete() as any).eq("id", lv.id);
          }
        }
      }
    }
  }
}

// ── Helper: handle product deletion ──
async function handleProductDelete(supabase: any, storeId: string, wcProductId: number) {
  const wcIdentifier = `wc_id:${wcProductId}`;
  await supabase.from("products").update({ is_active: false }).eq("store_id", storeId).eq("sku", wcIdentifier);
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const integrationId = url.searchParams.get("integration_id");

    if (!integrationId) {
      return new Response(JSON.stringify({ error: "Missing integration_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: integration, error: intError } = await supabase
      .from("integrations").select("*").eq("id", integrationId).single();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "Integration not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (integration.status !== "active") {
      return new Response(JSON.stringify({ error: "Integration inactive" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const userId = integration.user_id;
    const storeId = integration.store_id;
    const storeUrl = (integration as any).store_url || "";
    const consumerKey = (integration as any).consumer_key || "";
    const consumerSecret = integration.api_key || "";

    // Detect webhook topic from headers
    const topic = req.headers.get("x-wc-webhook-topic") || "";

    if (!body || !body.id) {
      return new Response(JSON.stringify({ success: true, message: "Webhook ping received" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PRODUCT WEBHOOKS ──
    if (topic.startsWith("product.") || (body.type && ["simple", "variable", "grouped", "external"].includes(body.type))) {
      if (topic === "product.deleted") {
        await handleProductDelete(supabase, storeId, body.id);
        return new Response(JSON.stringify({ success: true, action: "product_deleted" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // product.created or product.updated
      if (storeUrl && consumerKey && consumerSecret) {
        await syncSingleProduct(supabase, userId, storeId, body, storeUrl, consumerKey, consumerSecret);
      } else {
        // Fallback: just upsert the product without fetching variations from API
        const category = body.categories?.[0]?.name || "";
        const imageUrl = body.images?.[0]?.src || "";
        const price = parseFloat(body.price) || 0;
        const stock = body.stock_quantity ?? 0;
        const wcIdentifier = `wc_id:${body.id}`;

        const { data: existing } = await supabase
          .from("products").select("id").eq("store_id", storeId).eq("sku", wcIdentifier).maybeSingle();

        if (existing) {
          await supabase.from("products").update({
            name: body.name, price, stock, image_url: imageUrl, category, is_active: true,
          }).eq("id", existing.id);
        } else {
          await supabase.from("products").insert({
            user_id: userId, store_id: storeId, name: body.name, price, stock,
            image_url: imageUrl, category, sku: wcIdentifier, base_cost: 0, is_active: true,
            type: body.type === "virtual" ? "digital" : "physical",
          });
        }
      }

      return new Response(JSON.stringify({ success: true, action: "product_synced" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ORDER WEBHOOKS (existing logic) ──
    const wcOrder = body;

    const statusMap: Record<string, string> = {
      pending: "pending", processing: "pending", "on-hold": "pending",
      completed: "completed", cancelled: "cancelled", refunded: "cancelled", failed: "cancelled",
    };
    const paymentStatusMap: Record<string, string> = {
      pending: "unpaid", processing: "unpaid", "on-hold": "unpaid",
      completed: "paid", cancelled: "unpaid", refunded: "refunded", failed: "unpaid",
    };

    const wcStatus = wcOrder.status || "pending";
    const orderStatus = statusMap[wcStatus] || "pending";
    const paymentStatus = paymentStatusMap[wcStatus] || "unpaid";

    const billing = wcOrder.billing || {};
    const shipping = wcOrder.shipping || {};
    const customerName = `${billing.first_name || ""} ${billing.last_name || ""}`.trim() || "WooCommerce Customer";
    const customerEmail = billing.email || "";
    const customerPhone = billing.phone || "";
    const customerAddress = [billing.address_1, billing.address_2, billing.city, billing.state, billing.postcode, billing.country].filter(Boolean).join(", ");

    let customerId: string | null = null;
    if (customerEmail || customerPhone) {
      let query = supabase.from("customers").select("id").eq("store_id", storeId);
      if (customerEmail) query = query.eq("email", customerEmail);
      else query = query.eq("phone", customerPhone);
      const { data: existingCustomer } = await query.maybeSingle();
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer } = await supabase.from("customers").insert({
          user_id: userId, store_id: storeId, name: customerName,
          email: customerEmail, phone: customerPhone, address: customerAddress,
          notes: `Auto-created from WooCommerce order #${wcOrder.number || wcOrder.id}`,
        }).select("id").single();
        if (newCustomer) customerId = newCustomer.id;
      }
    }

    const meta: Record<string, unknown> = {
      wc_order_id: wcOrder.id, wc_order_number: wcOrder.number, wc_order_key: wcOrder.order_key, wc_status: wcStatus,
      billing: { first_name: billing.first_name, last_name: billing.last_name, company: billing.company, address_1: billing.address_1, address_2: billing.address_2, city: billing.city, state: billing.state, postcode: billing.postcode, country: billing.country, email: billing.email, phone: billing.phone },
      shipping: { first_name: shipping.first_name, last_name: shipping.last_name, company: shipping.company, address_1: shipping.address_1, address_2: shipping.address_2, city: shipping.city, state: shipping.state, postcode: shipping.postcode, country: shipping.country },
      line_items: (wcOrder.line_items || []).map((item: any) => ({ name: item.name, product_id: item.product_id, variation_id: item.variation_id, quantity: item.quantity, subtotal: item.subtotal, total: item.total, sku: item.sku, price: item.price, meta_data: item.meta_data })),
      shipping_lines: wcOrder.shipping_lines || [], fee_lines: wcOrder.fee_lines || [], coupon_lines: wcOrder.coupon_lines || [],
      payment_method_title: wcOrder.payment_method_title, transaction_id: wcOrder.transaction_id,
      customer_note: wcOrder.customer_note, meta_data: wcOrder.meta_data || [],
      date_created: wcOrder.date_created, date_paid: wcOrder.date_paid,
    };

    const totalAmount = parseFloat(wcOrder.total) || 0;
    const discount = parseFloat(wcOrder.discount_total) || 0;
    const currency = (wcOrder.currency || "BDT").toUpperCase();
    const notesParts: string[] = [];
    if (wcOrder.customer_note) notesParts.push(`Customer note: ${wcOrder.customer_note}`);
    notesParts.push(`WooCommerce Order #${wcOrder.number || wcOrder.id}`);

    const { data: existingOrder } = await supabase
      .from("orders").select("id").eq("store_id", storeId).eq("source", "woocommerce")
      .filter("meta->>wc_order_id", "eq", String(wcOrder.id)).maybeSingle();

    if (existingOrder) {
      await supabase.from("orders").update({
        total_amount: totalAmount, discount, discount_type: "fixed",
        payment_method: wcOrder.payment_method || "online", payment_status: paymentStatus,
        payment_currency: currency, status: orderStatus, notes: notesParts.join("\n"), meta, customer_id: customerId,
      }).eq("id", existingOrder.id);

      return new Response(JSON.stringify({ success: true, action: "updated", order_id: existingOrder.id }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: newOrder, error: orderError } = await supabase.from("orders").insert({
      user_id: userId, store_id: storeId, customer_id: customerId, total_amount: totalAmount,
      cost_price: 0, discount, discount_type: "fixed", payment_method: wcOrder.payment_method || "online",
      source: "woocommerce", payment_currency: currency, payment_status: paymentStatus,
      status: orderStatus, notes: notesParts.join("\n"), meta,
    }).select("id").single();

    if (orderError) {
      console.error("Order insert error:", orderError);
      return new Response(JSON.stringify({ error: orderError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (wcOrder.line_items && wcOrder.line_items.length > 0 && newOrder) {
      const orderItems = wcOrder.line_items.map((item: any) => ({
        order_id: newOrder.id, product_id: null, quantity: item.quantity || 1, price: parseFloat(item.price) || 0,
      }));
      await supabase.from("order_items").insert(orderItems);
    }

    const itemNames = (wcOrder.line_items || []).map((i: any) => i.name).slice(0, 3).join(", ");
    const notifMessage = `🛒 New website order #${wcOrder.number || wcOrder.id} from ${customerName} — ${currency} ${totalAmount.toFixed(2)}${itemNames ? ` (${itemNames})` : ""}`;
    await supabase.from("notifications").insert({ user_id: userId, message: notifMessage, type: "order" });

    return new Response(JSON.stringify({ success: true, action: "created", order_id: newOrder?.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
