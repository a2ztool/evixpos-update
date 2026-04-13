import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WcProduct {
  id: number;
  name: string;
  type: string; // simple, variable, grouped, external
  status: string;
  price: string;
  regular_price: string;
  sku: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  description: string;
  short_description: string;
  categories: Array<{ id: number; name: string }>;
  images: Array<{ src: string }>;
  variations: number[];
}

interface WcVariation {
  id: number;
  price: string;
  regular_price: string;
  sku: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  attributes: Array<{ name: string; option: string }>;
  image?: { src: string };
}

async function wcApiFetch(baseUrl: string, endpoint: string, consumerKey: string, consumerSecret: string, params: Record<string, string> = {}) {
  const url = new URL(`${baseUrl}/wp-json/wc/v3/${endpoint}`);
  url.searchParams.set("consumer_key", consumerKey);
  url.searchParams.set("consumer_secret", consumerSecret);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WC API ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

async function fetchAllProducts(baseUrl: string, ck: string, cs: string): Promise<WcProduct[]> {
  const all: WcProduct[] = [];
  let page = 1;
  while (true) {
    const batch = await wcApiFetch(baseUrl, "products", ck, cs, {
      per_page: "100",
      page: String(page),
      status: "publish",
    });
    if (!batch || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return all;
}

async function fetchVariations(baseUrl: string, ck: string, cs: string, productId: number): Promise<WcVariation[]> {
  const all: WcVariation[] = [];
  let page = 1;
  while (true) {
    const batch = await wcApiFetch(baseUrl, `products/${productId}/variations`, ck, cs, {
      per_page: "100",
      page: String(page),
    });
    if (!batch || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { action, integration_id } = body;

    if (!integration_id) {
      return new Response(JSON.stringify({ error: "Missing integration_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get integration details
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "Integration not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const storeUrl = (integration as any).store_url || "";
    const consumerKey = (integration as any).consumer_key || "";
    const consumerSecret = integration.api_key || "";
    const userId = integration.user_id;
    const storeId = integration.store_id;

    if (!storeUrl || !consumerKey || !consumerSecret) {
      return new Response(JSON.stringify({ error: "Incomplete WooCommerce credentials" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === TEST CONNECTION ===
    if (action === "test") {
      try {
        const info = await wcApiFetch(storeUrl, "", consumerKey, consumerSecret);
        return new Response(JSON.stringify({
          success: true,
          store_name: info?.store?.name || info?.name || "WooCommerce Store",
          wc_version: info?.wc_version || "unknown",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // === SYNC PRODUCTS ===
    if (action === "sync_products") {
      try {
        const wcProducts = await fetchAllProducts(storeUrl, consumerKey, consumerSecret);

        let synced = 0;
        let variationsSynced = 0;
        const wcProductIds: number[] = [];

        for (const wcp of wcProducts) {
          wcProductIds.push(wcp.id);

          const category = wcp.categories?.[0]?.name || "";
          const imageUrl = wcp.images?.[0]?.src || "";
          const price = parseFloat(wcp.price) || parseFloat(wcp.regular_price) || 0;
          const stock = wcp.stock_quantity ?? 0;
          const isVariable = wcp.type === "variable";
          const productType = wcp.type === "virtual" ? "digital" : "physical";

          // Check if product already exists by matching wc_product_id in description or sku
          const wcIdentifier = `wc_id:${wcp.id}`;
          const { data: existingProduct } = await supabase
            .from("products")
            .select("id")
            .eq("store_id", storeId)
            .eq("sku", wcIdentifier)
            .maybeSingle();

          let productId: string;

          if (existingProduct) {
            // Update existing product
            await supabase.from("products").update({
              name: wcp.name,
              price: price,
              stock: stock,
              image_url: imageUrl,
              category: category,
              type: productType,
              is_active: true,
              description: wcp.short_description || wcp.description || "",
            }).eq("id", existingProduct.id);

            productId = existingProduct.id;
            synced++;
          } else {
            // Insert new product
            const { data: newProduct, error: insertErr } = await supabase
              .from("products")
              .insert({
                user_id: userId,
                store_id: storeId,
                name: wcp.name,
                price: price,
                stock: stock,
                image_url: imageUrl,
                category: category,
                type: productType,
                is_active: true,
                sku: wcIdentifier,
                base_cost: 0,
                description: wcp.short_description || wcp.description || "",
              })
              .select("id")
              .single();

            if (insertErr) {
              console.error(`Failed to insert product ${wcp.name}:`, insertErr);
              continue;
            }
            productId = newProduct.id;
            synced++;
          }

          // Sync variations for variable products
          if (isVariable && wcp.variations && wcp.variations.length > 0) {
            const wcVariations = await fetchVariations(storeUrl, consumerKey, consumerSecret, wcp.id);
            const wcVarIds: number[] = [];

            for (let idx = 0; idx < wcVariations.length; idx++) {
              const wcv = wcVariations[idx];
              wcVarIds.push(wcv.id);

              const varName = wcv.attributes.map(a => a.option).join(" / ") || `Variation ${wcv.id}`;
              const varPrice = parseFloat(wcv.price) || parseFloat(wcv.regular_price) || 0;
              const varStock = wcv.stock_quantity ?? 0;

              // Check if variation exists
              const wcVarIdentifier = `wc_var:${wcv.id}`;
              const { data: existingVar } = await (supabase
                .from("product_variations" as any)
                .select("id")
                .eq("product_id", productId)
                .eq("name", wcVarIdentifier) as any)
                .maybeSingle();

              // We use a convention: store wc_var:ID in a way we can find it
              // Actually, let's use a better approach - search by name pattern
              const { data: existingVarByWcId } = await (supabase
                .from("product_variations" as any)
                .select("id")
                .eq("product_id", productId)
                .like("name", `%[wc:${wcv.id}]%`) as any)
                .maybeSingle();

              const displayName = `${varName} [wc:${wcv.id}]`;

              if (existingVarByWcId) {
                await (supabase.from("product_variations" as any).update({
                  name: displayName,
                  price: varPrice,
                  stock: varStock,
                  sort_order: idx,
                }) as any).eq("id", existingVarByWcId.id);
              } else {
                await (supabase.from("product_variations" as any).insert({
                  product_id: productId,
                  name: displayName,
                  price: varPrice,
                  stock: varStock,
                  sort_order: idx,
                  is_subscription: false,
                  duration_days: 0,
                }) as any);
              }
              variationsSynced++;
            }

            // Remove variations that no longer exist in WooCommerce
            const wcVarTags = wcVarIds.map(id => `[wc:${id}]`);
            const { data: allLocalVars } = await (supabase
              .from("product_variations" as any)
              .select("id, name")
              .eq("product_id", productId) as any);

            if (allLocalVars) {
              for (const lv of allLocalVars) {
                const match = (lv.name as string).match(/\[wc:(\d+)\]/);
                if (match && !wcVarTags.includes(`[wc:${match[1]}]`)) {
                  // This variation was deleted in WooCommerce
                  await (supabase.from("product_variations" as any).delete() as any).eq("id", lv.id);
                }
              }
            }
          }
        }

        // Deactivate products that are no longer in WooCommerce
        const wcSkus = wcProductIds.map(id => `wc_id:${id}`);
        const { data: allLocalProducts } = await supabase
          .from("products")
          .select("id, sku")
          .eq("store_id", storeId)
          .like("sku", "wc_id:%");

        if (allLocalProducts) {
          for (const lp of allLocalProducts) {
            if (lp.sku && !wcSkus.includes(lp.sku)) {
              await supabase.from("products").update({ is_active: false }).eq("id", lp.id);
            }
          }
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Synced ${synced} products and ${variationsSynced} variations from WooCommerce`,
          products_synced: synced,
          variations_synced: variationsSynced,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        console.error("Sync error:", err);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Sync function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
