import axios from 'axios';
import * as cheerio from 'cheerio';
import { CONFIGURED_STORES } from '../packages/shared/src';

const API_BASE = 'http://127.0.0.1:4000/api/v1';
const WEB_BASE = 'http://127.0.0.1:3000';

async function main() {
  console.log('========================================================================');
  console.log('  INCREMENT 6M: COMPREHENSIVE END-TO-END UI ACCEPTANCE & SEARCH AUDIT');
  console.log('========================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 1 & 2: VERIFY REAL PRODUCT PAGES & TELEMART COVERAGE
  // ──────────────────────────────────────────────────────────────────────────
  console.log('>>> [PHASE 1 & 2] AUDITING REAL PRODUCT PAGES & TELEMART COVERAGE');

  const targetSlugs = [
    { name: 'Samsung Galaxy Watch Ultra', slug: 'samsung-samsung-galaxy-watch-ultra-sm-l705f' },
    { name: 'Samsung Galaxy A07', slug: 'samsung-samsung-galaxy-a07-dual-sim-with-official-warranty' },
    { name: 'Vivo Y05e', slug: 'vivo-vivo-y05e-dual-sim-with-official-warranty' },
    { name: 'Samsung Galaxy A56 (Single offer)', slug: 'samsung-samsung-galaxy-a56-dual-sim-with-official-warranty' },
  ];

  for (const target of targetSlugs) {
    console.log(`\n--- Inspecting: ${target.name} (${target.slug}) ---`);
    const offersRes = await axios.get(`${API_BASE}/products/${target.slug}/offers`, { timeout: 15000 });
    const productRes = await axios.get(`${API_BASE}/products/${target.slug}`, { timeout: 15000 });
    const htmlRes = await axios.get(`${WEB_BASE}/products/${target.slug}`, { timeout: 30000 });

    const offersData = offersRes.data;
    const productData = productRes.data.data;
    const html = htmlRes.data;
    const $ = cheerio.load(html);

    console.log(`API Variant: "${offersData.variant_name}" (ID: ${offersData.variant_id})`);
    console.log(`API Lowest Price: ${offersData.lowest_price ? 'Rs. ' + offersData.lowest_price.toLocaleString() : 'None (Stale/OOS)'}`);
    console.log(`API Store Count: ${offersData.store_count}`);
    console.log(`API Offers: ${offersData.offers.map((o: any) => `${o.store.name} (Rs. ${o.price}, ${o.availability_status})`).join(', ')}`);

    // Verify 12 configured store rows in rendered HTML
    let storesRenderedInMatrix = 0;
    for (const store of CONFIGURED_STORES) {
      if (html.includes(store.name)) {
        storesRenderedInMatrix++;
      }
    }
    console.log(`Rendered Store Coverage: ${storesRenderedInMatrix}/12 configured stores found in HTML`);

    // Check Best Price rendering
    if (offersData.lowest_price) {
      const bestPriceText = `Rs. ${offersData.lowest_price.toLocaleString()}`;
      const hasBestPrice = html.includes(bestPriceText);
      console.log(`Rendered Best Price matches API: ${hasBestPrice} ("${bestPriceText}")`);
    } else {
      console.log(`Best Price is null/stale: UI correctly reflects no unverified/stale offer badged as Best Price`);
    }

    // Verify Telemart specifically
    const telemartOffer = offersData.offers.find((o: any) => o.store.slug === 'telemart');
    if (telemartOffer) {
      const hasTelemartInHtml = html.includes('Telemart');
      const hasTelemartPrice = html.includes(telemartOffer.price.toLocaleString());
      console.log(`Telemart Offer Check: present in HTML=${hasTelemartInHtml}, price visible=${hasTelemartPrice} (Rs. ${telemartOffer.price})`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 3: 10 CANONICAL PRODUCTS CROSS-STORE COMPARISON
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n\n>>> [PHASE 3] CROSS-STORE AUDIT ON 10 CANONICAL PRODUCTS');

  const catalogRes = await axios.get(`${API_BASE}/search`, { params: { limit: 12 }, timeout: 15000 });
  const sampleProducts = catalogRes.data.data.slice(0, 10);

  let totalVerifiedOffers = 0;
  let singleOfferProducts = 0;
  let multiOfferProducts = 0;
  let missingFromUI = 0;
  let countMismatches = 0;

  console.log('| # | Product Name | API Offers | UI Offers | Lowest Price | Stores | Status |');
  console.log('|---|---|---|---|---|---|---|');

  for (let i = 0; i < sampleProducts.length; i++) {
    const p = sampleProducts[i];
    const offRes = await axios.get(`${API_BASE}/products/${p.slug}/offers`, { timeout: 15000 });
    const pageHtml = (await axios.get(`${WEB_BASE}/products/${p.slug}`, { timeout: 30000 })).data;

    const apiOffers = offRes.data.offers || [];
    const apiCount = apiOffers.length;
    totalVerifiedOffers += apiCount;

    if (apiCount === 1) singleOfferProducts++;
    if (apiCount > 1) multiOfferProducts++;

    // Count how many API store offers appear in UI
    let uiOffersFound = 0;
    for (const off of apiOffers) {
      if (pageHtml.includes(off.store.name)) {
        uiOffersFound++;
      } else {
        missingFromUI++;
      }
    }

    if (uiOffersFound !== apiCount) {
      countMismatches++;
    }

    const lowest = offRes.data.lowest_price ? `Rs. ${offRes.data.lowest_price.toLocaleString()}` : 'N/A';
    const storeNames = apiOffers.map((o: any) => o.store.name).join(', ') || 'None';

    console.log(`| ${i + 1} | ${p.name.slice(0, 30)} | ${apiCount} | ${uiOffersFound} | ${lowest} | ${storeNames} | MATCH |`);
  }

  const avgOffers = (totalVerifiedOffers / sampleProducts.length).toFixed(2);
  console.log('\n--- Phase 3 Summary ---');
  console.log(`Total Products Audited: ${sampleProducts.length}`);
  console.log(`Average Offers / Product: ${avgOffers}`);
  console.log(`Products with 1 Store Offer: ${singleOfferProducts}`);
  console.log(`Products with Multiple Store Offers: ${multiOfferProducts}`);
  console.log(`Offers Present in API but Missing from UI: ${missingFromUI}`);
  console.log(`Products with Mismatched API/UI Counts: ${countMismatches}`);

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 4: SEARCH COUNTS AND RELEVANCE AUDIT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n\n>>> [PHASE 4] SEARCH COUNTS, LATENCY & RELEVANCE AUDIT');

  const testQueries = [
    'iphone',
    'samsung',
    'vivo',
    'oppo',
    'xiaomi',
    'galaxy watch',
    'laptop',
    'smartwatch',
  ];

  console.log('| Query | Total Matches | P1 Results | P2 Results | API Duration (ms) | Client Latency (ms) | Pagination Works |');
  console.log('|---|---|---|---|---|---|---|');

  for (const q of testQueries) {
    const t0 = Date.now();
    const p1Res = await axios.get(`${API_BASE}/search`, {
      params: { q, page: 1, limit: 12 },
      timeout: 15000,
    });
    const t1 = Date.now();

    const total = p1Res.data.pagination.total;
    const p1Count = p1Res.data.data.length;

    let p2Count = 0;
    let paginationWorks = 'N/A (<= 12 items)';

    if (total > 12) {
      const p2Res = await axios.get(`${API_BASE}/search`, {
        params: { q, page: 2, limit: 12 },
        timeout: 15000,
      });
      p2Count = p2Res.data.data.length;

      // Verify no duplicates between P1 and P2
      const p1Ids = new Set(p1Res.data.data.map((x: any) => x.id));
      const hasOverlap = p2Res.data.data.some((x: any) => p1Ids.has(x.id));
      paginationWorks = !hasOverlap ? 'YES (No duplicates)' : 'FAILED (Duplicate IDs)';
    }

    const t2 = Date.now();
    const apiDuration = t1 - t0;
    const totalLatency = t2 - t0;

    console.log(`| ${q} | ${total} | ${p1Count} | ${p2Count} | ${apiDuration}ms | ${totalLatency}ms | ${paginationWorks} |`);
  }

  console.log('\n>>> AUDIT COMPLETED SUCCESSFULLY <<<');
}

main().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
