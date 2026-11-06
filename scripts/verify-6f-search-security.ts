/**
 * scripts/verify-6f-search-security.ts
 *
 * Verifies PostgREST query escaping and input validation for search queries:
 *   - normal text
 *   - spaces (single and multiple)
 *   - % (wildcard safety)
 *   - _ (wildcard safety)
 *   - comma (delimiter safety in PostgREST .or() filter)
 *   - parentheses (logical grouping safety in PostgREST .or() filter)
 *   - apostrophe (string literal safety)
 *   - very long search input (bounded limit check)
 *   - SQL/PostgREST injection attempts (cannot escape filter tree)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { ProductService } from '../apps/api/src/services/productService.js';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  INCREMENT 6F — SEARCH INPUT SECURITY & POSTGREST AUDIT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const service = new ProductService(db);
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // 1. Normal Text
  console.log('--- 1. Normal text search ---');
  const normalRes = await service.listProducts({
    q: 'iPhone 17 Pro Max',
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  assert(normalRes.success === true, 'Normal text search succeeded');
  assert(normalRes.data.length > 0, `Normal text search found ${normalRes.data.length} products`);
  assert(
    normalRes.data.some((p) => p.name.toLowerCase().includes('iphone 17 pro max')),
    'Normal text results contain expected iPhone 17 Pro Max'
  );

  // 2. Spaces (leading, trailing, and excessive internal whitespace)
  console.log('\n--- 2. Spaces & whitespace handling ---');
  const spacesRes = await service.listProducts({
    q: '   iPhone     17    Pro    Max   ',
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  assert(spacesRes.success === true, 'Excessive spaces search succeeded without error');
  assert(spacesRes.data.length > 0, `Excessive spaces collapsed cleanly and found ${spacesRes.data.length} products`);
  assert(
    spacesRes.data.some((p) => p.name.toLowerCase().includes('iphone 17 pro max')),
    'Collapsed whitespace matches canonical product'
  );

  // 3. % (Wildcard Safety)
  console.log('\n--- 3. % Wildcard Safety ---');
  // A search of just '%' should NOT match all 729 products
  const percentRes = await service.listProducts({
    q: '%',
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  assert(percentRes.success === true, '% search succeeded without syntax error');
  assert(
    percentRes.pagination.total === 0,
    `Literal % search matched ${percentRes.pagination.total} products (expected 0, did not expand to global wildcard)`
  );

  const percentTextRes = await service.listProducts({
    q: '100% genuine',
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  assert(percentTextRes.success === true, 'Text with % succeeded without error');

  // 4. _ (Wildcard Safety)
  console.log('\n--- 4. _ Wildcard Safety ---');
  // 'Galaxy_Watch' has an underscore. In unescaped ILIKE, '_' matches space so it matches 'Galaxy Watch'.
  // With escaped ILIKE, it only matches a literal underscore.
  const underscoreRes = await service.listProducts({
    q: 'Galaxy_Watch',
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  assert(underscoreRes.success === true, 'Underscore search succeeded without syntax error');
  assert(
    underscoreRes.pagination.total === 0,
    `Literal underscore matched ${underscoreRes.pagination.total} products (expected 0, did not act as single-char wildcard)`
  );

  // 5. Comma (PostgREST .or() Delimiter Safety)
  console.log('\n--- 5. Comma Delimiter Safety ---');
  const commaRes = await service.listProducts({
    q: 'iPhone, 17',
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  assert(commaRes.success === true, 'Comma search succeeded without PostgREST grammar crash');
  assert(Array.isArray(commaRes.data), 'Comma search returned clean array');

  // 6. Parentheses (PostgREST Logic Tree Safety)
  console.log('\n--- 6. Parentheses Safety ---');
  const parensInputs = [
    'Apple (iPhone)',
    'Apple (iPhone',
    'Apple ) iPhone',
    '((()))',
  ];
  for (const parenQ of parensInputs) {
    const parenRes = await service.listProducts({
      q: parenQ,
      sort: 'relevance',
      pagination: { page: 1, limit: 10, offset: 0 },
    });
    assert(parenRes.success === true, `Parentheses search "${parenQ}" parsed cleanly without syntax error`);
  }

  // 7. Apostrophe (String Literal Safety)
  console.log("\n--- 7. Apostrophe Safety ---");
  const apostropheRes = await service.listProducts({
    q: "Apple's iPhone",
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  assert(apostropheRes.success === true, "Apostrophe search succeeded without string escaping error");

  // 8. Very Long Search Input
  console.log('\n--- 8. Very Long Search Input Safety ---');
  const longInput = 'A'.repeat(500);
  const longRes = await service.listProducts({
    q: longInput,
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  assert(longRes.success === true, '500-character input handled safely without query buffer overflow');
  assert(longRes.pagination.total === 0, 'Long string returned 0 results cleanly');

  // 9. SQL / PostgREST Injection Attempts
  console.log('\n--- 9. PostgREST / SQL Injection-Style Filter Manipulation Safety ---');
  const injectionInputs = [
    '",is_active.eq.false',
    '%,name.neq.null',
    'apple",or(is_active.eq.false)',
    'apple") or name.eq.("test',
    '\\",name.eq.null',
  ];
  for (const inj of injectionInputs) {
    const injRes = await service.listProducts({
      q: inj,
      sort: 'relevance',
      pagination: { page: 1, limit: 10, offset: 0 },
    });
    assert(injRes.success === true, `Injection payload "${inj}" contained within literal and safely evaluated`);
    // Ensure all returned products (if any) still have is_active: true
    for (const p of injRes.data) {
      assert(p.is_active === true, 'Returned product strictly adheres to is_active=true filter');
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  SEARCH SECURITY AUDIT: ${passed} passed, ${failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in search security audit:', err);
  process.exit(1);
});
