import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env") });
dotenv.config({ path: path.join(process.cwd(), "apps/web/.env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const db = createClient(supabaseUrl!, supabaseKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== RECONCILING 6E AUDIT ===");

  // 1. Inspect price_history
  const { data: history, error: hErr, count: hCount } = await db
    .from("price_history")
    .select("*", { count: "exact" })
    .order("recorded_at", { ascending: false })
    .limit(10);

  if (hErr) console.error("price_history error:", hErr);
  console.log("Total price_history count:", hCount);
  console.log("Top 10 latest price_history rows:");
  for (const r of history || []) {
    console.log(`ID: ${r.id}, variant: ${r.variant_id}, store: ${r.store_id}, price: ${r.price}, fee: ${r.shipping_fee}, stock: ${r.in_stock}, recorded_at: ${r.recorded_at}`);
  }

  // 2. Check the 3 newly matched variants in price_history
  const targetVariantIds = [
    '621cdabd-c2f6-42e5-8a20-2bd52d4b6374', // iPhone 17 Pro Max
    'c0b3c400-7747-470d-9e4c-6ac885d2154c', // Mi Band 10
    '3486efcf-79a1-408e-9e04-8d7792e72a64', // Galaxy Watch 8
  ];

  console.log("\nPrice history for 3 target variants:");
  for (const vId of targetVariantIds) {
    const { data: vHist } = await db
      .from("price_history")
      .select("*")
      .eq("variant_id", vId)
      .order("recorded_at", { ascending: false });
    console.log(`Variant ${vId} has ${vHist?.length} history rows:`);
    for (const h of vHist || []) {
      console.log(`  - store: ${h.store_id}, price: ${h.price}, fee: ${h.shipping_fee}, recorded_at: ${h.recorded_at}`);
    }
  }

  // 3. Inspect Galaxy Watch 8 40mm
  console.log("\nSamsung Galaxy Watch 8 detail:");
  const { data: watchProd } = await db
    .from("products")
    .select("*")
    .eq("slug", "samsung-samsung-galaxy-watch-8-40mm");
  console.log("Product:", watchProd);

  const { data: watchVar } = await db
    .from("product_variants")
    .select("*")
    .eq("id", "3486efcf-79a1-408e-9e04-8d7792e72a64");
  console.log("Variant:", watchVar);

  const { data: watchPrices } = await db
    .from("prices")
    .select("*, stores(name, slug)")
    .eq("variant_id", "3486efcf-79a1-408e-9e04-8d7792e72a64");
  console.log("Prices for Watch variant:");
  console.dir(watchPrices, { depth: null });

  const { data: watchIdents } = await db
    .from("store_product_identifiers")
    .select("*, stores(name, slug)")
    .eq("variant_id", "3486efcf-79a1-408e-9e04-8d7792e72a64");
  console.log("Identifiers for Watch variant:");
  console.dir(watchIdents, { depth: null });

  // Also check if Telemart has any other watch products
  const { data: allTelemartWatches } = await db
    .from("store_product_identifiers")
    .select("*, products(name, slug)")
    .ilike("identifier", "%galaxy-watch-8%");
  console.log("All Telemart identifiers with galaxy-watch-8:");
  console.dir(allTelemartWatches, { depth: null });

  // 4. Live DB mechanism enforcing one current price per (variant_id, store_id)
  // Let's query pg_indexes or information_schema
  const { data: constraints, error: cErr } = await db.rpc("get_table_constraints", { t_name: "prices" }).catch(() => ({ data: null, error: "rpc not available" }));
  console.log("Constraints RPC:", constraints, cErr);
}

main().catch(console.error);
