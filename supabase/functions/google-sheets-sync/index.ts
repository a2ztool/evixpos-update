import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FIELD_LABELS: Record<string, string> = {
  order_id: "Order ID",
  customer_name: "Customer Name",
  phone: "Phone",
  product_name: "Product Name",
  variation: "Variation",
  quantity: "Quantity",
  total_amount: "Total Amount",
  currency: "Currency",
  payment_status: "Payment Status",
  payment_method: "Payment Method",
  order_date: "Order Date",
  status: "Order Status",
  notes: "Notes",
  discount: "Discount",
  store_name: "Store Name",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlEncodeStr(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");

  const bin = atob(cleaned);
  const buffer = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buffer[i] = bin.charCodeAt(i);
  return buffer.buffer;
}

async function getGoogleAccessToken(credentials: any): Promise<string> {
  if (!credentials?.client_email || !credentials?.private_key) {
    throw new Error("Invalid service account credentials");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsignedToken = `${base64UrlEncodeStr(JSON.stringify(header))}.${base64UrlEncodeStr(JSON.stringify(payload))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(credentials.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken),
  );

  const assertion = `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error_description || data?.error || "Google authentication failed");
  }

  return data.access_token;
}

async function sheetsRequest(accessToken: string, sheetId: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const apiMessage = data?.error?.message || data?.message;
    throw new Error(apiMessage ? `Google Sheets API: ${apiMessage}` : `Google Sheets API failed (${response.status})`);
  }

  return data;
}

async function ensureTabExists(accessToken: string, sheetId: string, tabName: string) {
  const metadata = await sheetsRequest(accessToken, sheetId, "?fields=sheets(properties(title))");
  const exists = (metadata.sheets || []).some((sheet: any) => sheet.properties?.title === tabName);
  if (exists) return;

  await sheetsRequest(accessToken, sheetId, ":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: tabName } } }],
    }),
  });
}

function mapRow(fields: string[], row: Record<string, any>) {
  return fields.map((field) => {
    const value = row[field];
    if (value === null || value === undefined) return "";
    return typeof value === "number" ? value : String(value);
  });
}

async function ensureHeaderRow(accessToken: string, sheetId: string, tabName: string, headerRow: string[]) {
  const encodedTabName = encodeURIComponent(tabName);
  await sheetsRequest(accessToken, sheetId, `/values/${encodedTabName}!A1?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [headerRow] }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Supabase server configuration missing" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const storeId = typeof body?.store_id === "string" ? body.store_id : "";
    const action = typeof body?.action === "string" ? body.action : "sync_all";
    const orderId = typeof body?.order_id === "string" ? body.order_id : null;
    const orderData = body?.order_data && typeof body.order_data === "object" ? body.order_data : null;

    if (!storeId) {
      return json({ error: "store_id is required" }, 400);
    }

    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id, name, user_id")
      .eq("id", storeId)
      .maybeSingle();

    if (storeError || !store) {
      return json({ error: "Store not found" }, 404);
    }

    const isOwner = store.user_id === user.id;
    let effectiveUserId = store.user_id;

    if (!isOwner) {
      const { data: staffMember } = await supabase
        .from("staff_members")
        .select("id, user_id")
        .eq("store_id", storeId)
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!staffMember) {
        return json({ error: "Unauthorized" }, 403);
      }

      effectiveUserId = staffMember.user_id;
    }

    const { data: config, error: configError } = await supabase
      .from("google_sheets_config")
      .select("*")
      .eq("store_id", storeId)
      .eq("user_id", effectiveUserId)
      .maybeSingle();

    if (configError || !config) {
      return json({ error: "Google Sheets config not found" }, 404);
    }

    if (!config.credentials) {
      return json({ error: "Service account credentials missing" }, 400);
    }

    if (!config.sheet_id) {
      return json({ error: "Google Sheet ID is not configured" }, 400);
    }

    const fields: string[] = Array.isArray(config.field_mapping)
      ? config.field_mapping
      : ["order_id", "customer_name", "total_amount", "order_date"];
    const headerRow = fields.map((field) => FIELD_LABELS[field] || field);
    const tabName = config.tab_name || "Orders";
    const accessToken = await getGoogleAccessToken(config.credentials);

    await ensureTabExists(accessToken, config.sheet_id, tabName);

    if ((action === "sync_single" || action === "sync_one") && orderData) {
      const encodedTabName = encodeURIComponent(tabName);
      await ensureHeaderRow(accessToken, config.sheet_id, tabName, headerRow);
      await sheetsRequest(
        accessToken,
        config.sheet_id,
        `/values/${encodedTabName}!A2:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          body: JSON.stringify({ values: [mapRow(fields, orderData)] }),
        },
      );

      await supabase
        .from("google_sheets_config")
        .update({ last_synced_at: new Date().toISOString(), status: "connected" })
        .eq("id", config.id);

      return json({ success: true, rows_synced: 1 });
    }

    let ordersQuery = supabase
      .from("orders")
      .select("id, total_amount, payment_currency, payment_status, payment_method, status, notes, discount, created_at, customer_id")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if ((action === "sync_single" || action === "sync_one") && orderId) {
      ordersQuery = supabase
        .from("orders")
        .select("id, total_amount, payment_currency, payment_status, payment_method, status, notes, discount, created_at, customer_id")
        .eq("store_id", storeId)
        .eq("id", orderId)
        .limit(1);
    }

    const { data: orders, error: ordersError } = await ordersQuery;
    if (ordersError) {
      return json({ error: ordersError.message }, 500);
    }

    const orderList = orders || [];
    const customerIds = [...new Set(orderList.map((order) => order.customer_id).filter(Boolean))];
    const orderIds = orderList.map((order) => order.id);

    const customersMap = new Map<string, any>();
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name, phone")
        .in("id", customerIds as string[]);
      (customers || []).forEach((customer) => customersMap.set(customer.id, customer));
    }

    const itemsByOrder = new Map<string, any[]>();
    const productsMap = new Map<string, any>();

    if (orderIds.length > 0) {
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, quantity, product_id")
        .in("order_id", orderIds);

      (items || []).forEach((item) => {
        const existing = itemsByOrder.get(item.order_id) || [];
        existing.push(item);
        itemsByOrder.set(item.order_id, existing);
      });

      const productIds = [...new Set((items || []).map((item) => item.product_id).filter(Boolean))];
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("id, name")
          .in("id", productIds as string[]);
        (products || []).forEach((product) => productsMap.set(product.id, product));
      }
    }

    const rows = orderList.map((order) => {
      const items = itemsByOrder.get(order.id) || [];
      const productNames = items
        .map((item) => productsMap.get(item.product_id)?.name)
        .filter(Boolean)
        .join(", ");
      const totalQty = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const customer = order.customer_id ? customersMap.get(order.customer_id) : null;

      return mapRow(fields, {
        order_id: order.id,
        customer_name: customer?.name || "Walk-in",
        phone: customer?.phone || "",
        product_name: productNames,
        variation: "",
        quantity: totalQty,
        total_amount: order.total_amount,
        currency: order.payment_currency,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        order_date: order.created_at,
        status: order.status,
        notes: order.notes || "",
        discount: order.discount || 0,
        store_name: store.name || "",
      });
    });

    const encodedTabName = encodeURIComponent(tabName);
    await sheetsRequest(accessToken, config.sheet_id, `/values/${encodedTabName}:clear`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await sheetsRequest(accessToken, config.sheet_id, `/values/${encodedTabName}!A1?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      body: JSON.stringify({ values: [headerRow, ...rows] }),
    });

    await supabase
      .from("google_sheets_config")
      .update({ last_synced_at: new Date().toISOString(), status: "connected" })
      .eq("id", config.id);

    return json({ success: true, rows_synced: rows.length });
  } catch (error: any) {
    console.error("google-sheets-sync-v2 error:", error?.message || error);
    return json({ error: error?.message || "Sync failed" }, 500);
  }
});
