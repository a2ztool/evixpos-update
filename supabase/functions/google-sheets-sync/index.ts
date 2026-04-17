// Google Sheets Sync Edge Function (public — verify_jwt=false in config.toml)
// Reads google_sheets_config, fetches orders for the store, then writes them
// to the configured Google Sheet using a service-account JWT against the
// Google Sheets API v4.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

// ---------- Google JWT (RS256) auth ----------
function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlEncodeStr(s: string): string {
  return base64UrlEncode(new TextEncoder().encode(s));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(cleaned);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getGoogleAccessToken(creds: any): Promise<string> {
  if (!creds?.client_email || !creds?.private_key) {
    throw new Error("Invalid service account credentials (missing client_email/private_key)");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = `${base64UrlEncodeStr(JSON.stringify(header))}.${base64UrlEncodeStr(JSON.stringify(payload))}`;

  const keyData = pemToArrayBuffer(creds.private_key);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(enc),
  );
  const jwt = `${enc}.${base64UrlEncode(new Uint8Array(sig))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`Google OAuth failed: ${JSON.stringify(tokenJson)}`);
  }
  return tokenJson.access_token;
}

// ---------- Sheets helpers ----------
async function sheetsRequest(
  accessToken: string,
  sheetId: string,
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    },
  );
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Sheets API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function ensureTabExists(accessToken: string, sheetId: string, tabName: string) {
  const meta = await sheetsRequest(accessToken, sheetId, "?fields=sheets(properties(title))");
  const exists = (meta.sheets || []).some((s: any) => s.properties?.title === tabName);
  if (exists) return;
  await sheetsRequest(accessToken, sheetId, ":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: tabName } } }],
    }),
  });
}

function valueToCell(v: any): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  return String(v);
}

// ---------- Main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { store_id, action = "sync_all", order_id } = await req.json();
    if (!store_id) throw new Error("store_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Load config
    const { data: cfg, error: cfgErr } = await supabase
      .from("google_sheets_config")
      .select("*")
      .eq("store_id", store_id)
      .maybeSingle();
    if (cfgErr) throw cfgErr;
    if (!cfg) throw new Error("No Google Sheets config for this store");
    if (!cfg.credentials) throw new Error("Service account credentials missing");
    if (!cfg.sheet_id) throw new Error("Google Sheet ID is not configured");

    const fields: string[] = Array.isArray(cfg.field_mapping)
      ? cfg.field_mapping
      : ["order_id", "customer_name", "total_amount", "order_date"];

    // Store name
    const { data: store } = await supabase
      .from("stores").select("name").eq("id", store_id).maybeSingle();

    // Fetch orders
    let ordersQuery = supabase
      .from("orders")
      .select("id, total_amount, payment_currency, payment_status, payment_method, status, notes, discount, created_at, customer_id")
      .eq("store_id", store_id)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (action === "sync_one" && order_id) {
      ordersQuery = supabase
        .from("orders")
        .select("id, total_amount, payment_currency, payment_status, payment_method, status, notes, discount, created_at, customer_id")
        .eq("id", order_id);
    }
    const { data: orders, error: ordersErr } = await ordersQuery;
    if (ordersErr) throw ordersErr;
    const orderList = orders || [];

    // Customers
    const customerIds = [...new Set(orderList.map((o) => o.customer_id).filter(Boolean))];
    let customersMap = new Map<string, any>();
    if (customerIds.length) {
      const { data: customers } = await supabase
        .from("customers").select("id, name, phone").in("id", customerIds);
      (customers || []).forEach((c) => customersMap.set(c.id, c));
    }

    // Order items + products
    const orderIds = orderList.map((o) => o.id);
    let itemsByOrder = new Map<string, any[]>();
    let productsMap = new Map<string, any>();
    if (orderIds.length) {
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, quantity, product_id")
        .in("order_id", orderIds);
      (items || []).forEach((it) => {
        const arr = itemsByOrder.get(it.order_id) || [];
        arr.push(it);
        itemsByOrder.set(it.order_id, arr);
      });
      const productIds = [...new Set((items || []).map((i) => i.product_id).filter(Boolean))];
      if (productIds.length) {
        const { data: products } = await supabase
          .from("products").select("id, name").in("id", productIds);
        (products || []).forEach((p) => productsMap.set(p.id, p));
      }
    }

    // Build rows (one row per order — concat product names if multiple)
    const headerRow = fields.map((f) => FIELD_LABELS[f] || f);
    const dataRows = orderList.map((o) => {
      const items = itemsByOrder.get(o.id) || [];
      const productNames = items
        .map((i) => productsMap.get(i.product_id)?.name)
        .filter(Boolean).join(", ");
      const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);
      const cust = o.customer_id ? customersMap.get(o.customer_id) : null;

      const map: Record<string, any> = {
        order_id: o.id,
        customer_name: cust?.name || "Walk-in",
        phone: cust?.phone || "",
        product_name: productNames,
        variation: "",
        quantity: totalQty,
        total_amount: o.total_amount,
        currency: o.payment_currency,
        payment_status: o.payment_status,
        payment_method: o.payment_method,
        order_date: o.created_at,
        status: o.status,
        notes: o.notes || "",
        discount: o.discount || 0,
        store_name: store?.name || "",
      };
      return fields.map((f) => valueToCell(map[f]));
    });

    // Auth with Google
    const accessToken = await getGoogleAccessToken(cfg.credentials);
    const tabName = cfg.tab_name || "Orders";
    await ensureTabExists(accessToken, cfg.sheet_id, tabName);

    // Clear + write header + rows (full overwrite of the tab)
    const tabRange = encodeURIComponent(tabName);
    await sheetsRequest(accessToken, cfg.sheet_id, `/values/${tabRange}:clear`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await sheetsRequest(
      accessToken,
      cfg.sheet_id,
      `/values/${tabRange}!A1?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        body: JSON.stringify({ values: [headerRow, ...dataRows] }),
      },
    );

    // Update last_synced_at
    await supabase.from("google_sheets_config")
      .update({ last_synced_at: new Date().toISOString(), status: "connected" })
      .eq("id", cfg.id);

    return new Response(
      JSON.stringify({ success: true, rows_synced: dataRows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("google-sheets-sync error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
