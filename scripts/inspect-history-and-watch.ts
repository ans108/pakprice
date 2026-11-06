import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import axios from "axios";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env") });
dotenv.config({ path: path.join(process.cwd(), "apps/web/.env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const db = createClient(supabaseUrl!, supabaseKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== STEP 1: PRICE HISTORY ANALYSIS ===");
  const { data: latestHist, count: totalCount } = await db
    .from("price_history")
    .select("id, variant_id, store_id, price, original_price, shipping_fee, in_stock, scraped_at", { count: "exact" })
    .order("scraped_at", { ascending: false })
    .limit(10);

  console.log(`Total price_history count: ${totalCount}`);
  console.log("Top 10 latest price_history rows:");
  for (const r of latestHist || []) {
    console.log(`- ID: ${r.id} | variant: ${r.variant_id} | store: ${r.store_id} | price: ${r.price} | scraped_at: ${r.scraped_at}`);
  }

  // Check what was added around 2026-09-23T12:00:00Z
  const { data: recentRows } = await db
    .from("price_history")
    .select("id, variant_id, store_id, price, original_price, shipping_fee, in_stock, scraped_at")
    .gte("scraped_at", "2026-09-23T00:00:00Z")
    .order("scraped_at", { ascending: true });

  console.log(`\nPrice history rows created today (2026-09-23): ${recentRows?.length}`);
  for (const r of recentRows || []) {
    console.log(`- ID: ${r.id} | variant: ${r.variant_id} | store: ${r.store_id} | price: ${r.price} | scraped_at: ${r.scraped_at}`);
  }

  console.log("\n=== STEP 2: TELEMART 40MM VS 46MM INSPECTION ===");
  const telemart40mmUrl = "https://www.telemart.pk/collections/mens-watches/products/samsung-galaxy-watch-8-40mm";
  const telemart46mmUrl = "https://www.telemart.pk/products/samsung-galaxy-watch-8-classic-46mm";

  console.log("Testing Telemart 40mm PDP fetch...");
  try {
    const res40 = await axios.get(telemart40mmUrl + ".json", {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000,
      validateStatus: () => true
    });
    console.log(`Telemart 40mm JSON status: ${res40.status}`);
    if (res40.status === 200 && res40.data?.product) {
      const p = res40.data.product;
      console.log(`Product Title: "${p.title}"`);
      console.log(`Product ID: ${p.id}`);
      console.log(`Handle: ${p.handle}`);
      console.log(`Variants count: ${p.variants?.length}`);
      for (const v of p.variants || []) {
        console.log(`  - Variant ID: ${v.id}, title: "${v.title}", price: ${v.price}, sku: "${v.sku}"`);
      }
    } else {
      console.log(`Telemart 40mm JSON response:`, typeof res40.data === 'string' ? res40.data.substring(0, 200) : res40.data);
    }
  } catch (err: any) {
    console.log(`Telemart 40mm fetch error: ${err.message}`);
  }

  try {
    const res46 = await axios.get(telemart46mmUrl + ".json", {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000,
      validateStatus: () => true
    });
    console.log(`\nTelemart 46mm JSON status: ${res46.status}`);
    if (res46.status === 200 && res46.data?.product) {
      const p = res46.data.product;
      console.log(`Product Title: "${p.title}"`);
      console.log(`Product ID: ${p.id}`);
      console.log(`Handle: ${p.handle}`);
      console.log(`Variants count: ${p.variants?.length}`);
      for (const v of p.variants || []) {
        console.log(`  - Variant ID: ${v.id}, title: "${v.title}", price: ${v.price}, sku: "${v.sku}"`);
      }
    }
  } catch (err: any) {
    console.log(`Telemart 46mm fetch error: ${err.message}`);
  }

  // Check Telemart products in DB
  const { data: tmProducts } = await db
    .from("products")
    .select("id, name, slug")
    .ilike("name", "%galaxy watch 8%");
  console.log("\nProducts in DB matching 'galaxy watch 8':", tmProducts);

  // Check store_product_identifiers for Telemart store
  const { data: tmStore } = await db.from("stores").select("id").eq("slug", "telemart").single();
  const { data: tmIdents } = await db
    .from("store_product_identifiers")
    .select("id, variant_id, identifier, identifier_type")
    .eq("store_id", tmStore?.id);

  console.log(`Total Telemart identifiers in DB: ${tmIdents?.length}`);
}

main().catch(console.error);
