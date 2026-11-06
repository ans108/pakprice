import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), "apps/web/.env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const db = createClient(supabaseUrl!, supabaseKey!);
const SLUGS = ["unknown-zero-visionary-smartwatch","unknown-infinix-xw3gt-smart-watch","unknown-i20-ultra-smart-watch-with-earbuds-and-7-straps","unknown-docomo-tab-d41-a","unknown-kieslect-kr-calling-watch"];
let pass=0,fail=0; const fails:string[]=[];
const ok=(l:string)=>{console.log(`  OK  ${l}`);pass++;};
const ko=(l:string,d?:string)=>{const m=l+(d?`: ${d}`:"");console.log(`  FAIL ${m}`);fails.push(m);fail++;};
const sec=(t:string)=>console.log(`\n${"=".repeat(52)}\n  ${t}`);
async function p0(){
  sec("Phase 0: Multi-Store Baseline");
  let c=0;
  for(const slug of SLUGS){
    const{data:prod}=await db.from("products").select("id,name").eq("slug",slug).eq("is_active",true).maybeSingle();
    if(!prod){ko(slug,"not in DB");continue;}
    const{data:vr}=await db.from("product_variants").select("id").eq("product_id",prod.id).eq("is_active",true);
    const ids=(vr||[]).map((v:any)=>v.id);
    if(!ids.length){ko(slug,"no active variants");continue;}
    const{data:pr}=await db.from("prices").select("store_id").in("variant_id",ids);
    const s=new Set((pr||[]).map((p:any)=>p.store_id));
    if(s.size>=2){c++;ok(`${prod.name} → ${s.size} stores`);}
    else ko(slug,`only ${s.size} store`);
  }
  c===5?ok("All 5 multi-store products confirmed"):ko("Expected 5",`found ${c}`);
}
async function p1(){
  sec("Phase 1: DB Counts (Before)");
  const[{count:p},{count:v},{count:pr},{count:ph}]=await Promise.all([
    db.from("products").select("*",{count:"exact",head:true}),
    db.from("product_variants").select("*",{count:"exact",head:true}),
    db.from("prices").select("*",{count:"exact",head:true}),
    db.from("price_history").select("*",{count:"exact",head:true}),
  ]);
  console.log(`  products=${p} variants=${v} prices=${pr} history=${ph}`);
  ok("Counts recorded");
  return{p,v,pr,ph};
}
function p2(){
  sec("Phase 2: Shared Types");
  const t=fs.readFileSync(path.join(process.cwd(),"packages/shared/src/types/index.ts"),"utf8");
  t.includes("export interface MultiStoreOffer")?ok("MultiStoreOffer"):ko("MultiStoreOffer missing");
  t.includes("export interface OffersResponse")?ok("OffersResponse"):ko("OffersResponse missing");
  t.includes("has_multi_store: boolean")?ok("has_multi_store field"):ko("has_multi_store missing");
  t.includes("lowest_price: number | null")?ok("lowest_price field"):ko("lowest_price missing");
  const wt=fs.readFileSync(path.join(process.cwd(),"apps/web/src/types/index.ts"),"utf8");
  (wt.includes("MultiStoreOffer")&&wt.includes("OffersResponse"))?ok("Web re-exports types"):ko("Web types missing exports");
}
function p3(){
  sec("Phase 3: API /offers Endpoint");
  const repo=fs.readFileSync(path.join(process.cwd(),"apps/api/src/repositories/productRepository.ts"),"utf8");
  repo.includes("findMultiStoreOffers")?ok("findMultiStoreOffers"):ko("findMultiStoreOffers missing");
  const svc=fs.readFileSync(path.join(process.cwd(),"apps/api/src/services/productService.ts"),"utf8");
  svc.includes("getMultiStoreOffers")?ok("getMultiStoreOffers"):ko("getMultiStoreOffers missing");
  const ctrl=fs.readFileSync(path.join(process.cwd(),"apps/api/src/controllers/productsController.ts"),"utf8");
  ctrl.includes("async offers(")?ok("offers handler"):ko("offers handler missing");
  const routes=fs.readFileSync(path.join(process.cwd(),"apps/api/src/routes/products.ts"),"utf8");
  routes.includes("/:slug/offers")?ok("/:slug/offers route"):ko("/:slug/offers route missing");
}
function p4(){
  sec("Phase 4: Web UI Changes");
  const card=fs.readFileSync(path.join(process.cwd(),"apps/web/src/components/products/StoreOfferCard.tsx"),"utf8");
  card.includes("isLowest")?ok("StoreOfferCard: isLowest prop"):ko("isLowest missing");
  card.includes("Best Deal")?ok("StoreOfferCard: Best Deal chip"):ko("Best Deal chip missing");
  card.includes("Trophy")?ok("StoreOfferCard: Trophy icon"):ko("Trophy icon missing");
  const detail=fs.readFileSync(path.join(process.cwd(),"apps/web/src/app/products/[slug]/ProductDetailClient.tsx"),"utf8");
  detail.includes("Multi-store")?ok("ProductDetailClient: multi-store badge"):ko("multi-store badge missing");
  detail.includes("isLowest")?ok("ProductDetailClient: isLowest passed"):ko("isLowest not passed");
  const compare=fs.readFileSync(path.join(process.cwd(),"apps/web/src/app/compare/CompareClient.tsx"),"utf8");
  compare.includes("showOutOfStock")?ok("CompareClient: out-of-stock toggle"):ko("out-of-stock toggle missing");
  (compare.includes("getProductStoreCount")||compare.includes("storeCount"))?ok("CompareClient: store count"):ko("store count missing");
  compare.includes("TrendingDown")?ok("CompareClient: savings indicator"):ko("savings indicator missing");
  compare.includes("Trophy")?ok("CompareClient: Trophy icon"):ko("Trophy icon missing");
  const home=fs.readFileSync(path.join(process.cwd(),"apps/web/src/app/page.tsx"),"utf8");
  (home.includes("MULTI_STORE_DEALS")||home.includes("multi-store-deals"))?ok("Home: multi-store section"):ko("multi-store section missing");
  home.includes("unknown-zero-visionary-smartwatch")?ok("Home: verified product slugs"):ko("Home: verified slugs missing");
}
async function p5(before:any){
  sec("Phase 5: Real /offers Query Correctness");
  for(const slug of SLUGS.slice(0,3)){
    const{data,error}=await db.from("products").select("id,name,slug,is_active,variants:product_variants(id,name,ram_gb,storage_gb,color,is_active,prices(id,variant_id,store_id,price,in_stock,store:stores(id,name,slug,logo_url,base_url)))").eq("slug",slug).eq("is_active",true).maybeSingle();
    if(error||!data){ko(`/offers query: ${slug}`,error?.message);continue;}
    const storeIds=new Set<string>();
    let oc=0;
    for(const v of (data.variants||[]) as any[]){
      if(!v.is_active)continue;
      for(const p of (v.prices||[]) as any[]){if(p.store){storeIds.add(p.store_id);oc++;}}
    }
    oc>0?ok(`${slug}: ${oc} offers, ${storeIds.size} stores`):ko(`${slug}: no offers`);
    storeIds.size>=2?ok(`${slug}: has_multi_store=true`):ko(`${slug}: has_multi_store should be true`);
  }
  sec("Phase 6: Zero-Write Invariant (After)");
  const[{count:p2},{count:v2},{count:pr2},{count:ph2}]=await Promise.all([
    db.from("products").select("*",{count:"exact",head:true}),
    db.from("product_variants").select("*",{count:"exact",head:true}),
    db.from("prices").select("*",{count:"exact",head:true}),
    db.from("price_history").select("*",{count:"exact",head:true}),
  ]);
  before.p===p2?ok(`products unchanged (${p2})`):ko("products written",`${before.p}→${p2}`);
  before.v===v2?ok(`variants unchanged (${v2})`):ko("variants written",`${before.v}→${v2}`);
  before.pr===pr2?ok(`prices unchanged (${pr2})`):ko("prices written",`${before.pr}→${pr2}`);
  before.ph===ph2?ok(`history unchanged (${ph2})`):ko("history written",`${before.ph}→${ph2}`);
}
async function main(){
  console.log("\n=== Increment 6C — Final Verification ===");
  try{
    await p0();
    const before=await p1();
    p2();p3();p4();
    await p5(before);
  }catch(e){console.error("Fatal:",e);process.exit(1);}
  console.log(`\n${"=".repeat(52)}`);
  if(fail===0){console.log(`  ALL PASSED: ${pass} checks`);console.log("  Increment 6C — COMPLETE / VERIFIED / LOCKED");}
  else{console.log(`  ${pass} passed, ${fail} failed`);fails.forEach(f=>console.log(`    - ${f}`));console.log("  Status: NOT VERIFIED");}
  process.exit(fail>0?1:0);
}
main();
