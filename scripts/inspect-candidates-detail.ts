import { createClient } from "@supabase/supabase-js";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env") });
dotenv.config({ path: path.join(process.cwd(), "apps/web/.env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const db = createClient(supabaseUrl!, supabaseKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== EXACT ROWS FOR CANDIDATES ===\n");

  for (const name of ["Zero Luna", "Zero Ignite"]) {
    console.log(`\n---------------------------------`);
    console.log(`  Querying for "${name}"`);
    console.log(`---------------------------------`);
    
    const { data: prods } = await db
      .from("products")
      .select(`
        id, name, slug, normalized_name, brand_id, category_id,
        product_variants (
          id, name, normalized_name, model_number,
          prices (
            id, store_id, price, original_price, in_stock, product_url, last_scraped_at,
            stores ( id, name, slug )
          ),
          store_product_identifiers (
            id, store_id, identifier, identifier_type
          )
        )
      `)
      .ilike("name", `%${name}%`);

    for (const p of prods || []) {
      if (p.name.includes("Pro") || p.name.includes("360")) continue;
      console.log(`Product: ID=${p.id} | Slug=${p.slug} | Name="${p.name}" | Normalized="${p.normalized_name}"`);
      for (const v of p.product_variants || []) {
        console.log(`  Variant: ID=${v.id} | Name="${v.name}" | Model=${v.model_number}`);
        for (const pr of v.prices || []) {
          console.log(`    Price: ID=${pr.id} | Store=${pr.stores?.slug} | Rs. ${pr.price} | InStock=${pr.in_stock} | URL=${pr.product_url}`);
        }
        for (const iden of v.store_product_identifiers || []) {
          console.log(`    Identifier: StoreId=${iden.store_id} | Type=${iden.identifier_type} | Val=${iden.identifier}`);
        }
      }
    }
  }
}

main().catch(console.error);
