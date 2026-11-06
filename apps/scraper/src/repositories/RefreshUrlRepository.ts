import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { scraperConfig } from '../config/scraperConfig';

export interface RefreshCandidate {
  priceId: string;
  productUrl: string;
  variantId: string;
  storeId: string;
  lastScrapedAt: string | null;
  sourceIdentifier: string | null;
  sourceIdentifierType: string | null;
}

export class RefreshUrlRepository {
  private supabase: SupabaseClient;

  constructor(supabaseClient?: SupabaseClient) {
    this.supabase = supabaseClient || createClient(scraperConfig.supabaseUrl, scraperConfig.supabaseServiceKey);
  }

  /**
   * Retrieves bounded refresh candidate URLs for a store using stale-first priority.
   *
   * Step 1: Queries prices table directly with DB-enforced limit.
   * Step 2: Fetches store_product_identifiers for ONLY the selected variant IDs.
   * Step 3: Hydrates candidates in application code to guarantee 1:1 row correspondence.
   */
  async getRefreshCandidates(storeId: string, limit: number): Promise<RefreshCandidate[]> {
    if (!storeId || limit <= 0) return [];

    // Step 1: Query prices only (guaranteed 1 row per (variant_id, store_id))
    const { data: priceRows, error: pErr } = await this.supabase
      .from('prices')
      .select('id, product_url, variant_id, store_id, last_scraped_at')
      .eq('store_id', storeId)
      .not('product_url', 'is', null)
      .neq('product_url', '')
      .order('last_scraped_at', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .limit(limit);

    if (pErr) {
      throw new Error(`Failed to query refresh candidate prices: ${pErr.message}`);
    }

    if (!priceRows || priceRows.length === 0) {
      return [];
    }

    // Step 2: Fetch store_product_identifiers for ONLY the selected variants
    const variantIds = priceRows.map((r) => r.variant_id);
    const { data: idRows, error: idErr } = await this.supabase
      .from('store_product_identifiers')
      .select('variant_id, store_id, identifier, identifier_type')
      .eq('store_id', storeId)
      .in('variant_id', variantIds);

    if (idErr) {
      console.warn(`Failed to fetch identifiers for refresh candidates: ${idErr.message}`);
    }

    // Index identifiers by variant_id. Prioritize url_slug > product_id > sku > barcode > asin
    const priorityOrder: Record<string, number> = {
      url_slug: 1,
      product_id: 2,
      sku: 3,
      barcode: 4,
      asin: 5,
    };

    const idMap = new Map<string, { identifier: string; identifier_type: string }>();

    for (const idRow of idRows || []) {
      const existing = idMap.get(idRow.variant_id);
      if (!existing) {
        idMap.set(idRow.variant_id, {
          identifier: idRow.identifier,
          identifier_type: idRow.identifier_type,
        });
      } else {
        const curPriority = priorityOrder[idRow.identifier_type] ?? 99;
        const prevPriority = priorityOrder[existing.identifier_type] ?? 99;
        if (curPriority < prevPriority) {
          idMap.set(idRow.variant_id, {
            identifier: idRow.identifier,
            identifier_type: idRow.identifier_type,
          });
        }
      }
    }

    // Step 3: Hydrate refresh candidate objects (guaranteeing exact 1:1 mapping with priceRows)
    return priceRows.map((r) => {
      const matchedId = idMap.get(r.variant_id);
      return {
        priceId: r.id,
        productUrl: r.product_url,
        variantId: r.variant_id,
        storeId: r.store_id,
        lastScrapedAt: r.last_scraped_at,
        sourceIdentifier: matchedId?.identifier || null,
        sourceIdentifierType: matchedId?.identifier_type || null,
      };
    });
  }
}
