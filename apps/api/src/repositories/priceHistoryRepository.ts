import { SupabaseClient } from '@supabase/supabase-js';

type HistoryRange = '7d' | '30d' | '90d' | '1y' | 'all';

/**
 * Calculates cutoff date for price history range.
 * In accordance with Increment 5E and user guidelines, the maximum query window
 * is strictly capped at 365 days (1 year) to prevent unbounded data retrieval.
 */
function getRangeDate(range: HistoryRange): string {
  const now = new Date();
  switch (range) {
    case '7d':
      now.setDate(now.getDate() - 7);
      break;
    case '30d':
      now.setDate(now.getDate() - 30);
      break;
    case '90d':
      now.setDate(now.getDate() - 90);
      break;
    case '1y':
    case 'all':
    default:
      // Maximum query window is strictly capped at 365 days
      now.setFullYear(now.getFullYear() - 1);
      break;
  }
  return now.toISOString();
}

export class PriceHistoryRepository {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Optimized price history retrieval:
   * 1. Product + active variants lookup in 1 application DB round trip.
   * 2. History points query and current lowest price query executed concurrently
   *    via Promise.all (2 DB round trips).
   * Total: exactly 3 application DB round trips.
   */
  async getHistoryAndLowestPrice(slug: string, range: HistoryRange, variantId?: string, storeId?: string) {
    // Stage 1: Lookup product & variants in a single round-trip
    const { data: product, error: prodError } = await this.db
      .from('products')
      .select('id, variants:product_variants ( id, is_active )')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (prodError) throw prodError;
    if (!product) return null;

    let activeVariants: { id: string; is_active: boolean }[] = (product.variants || []).filter(
      (v: any) => v.is_active
    );

    if (variantId) {
      activeVariants = activeVariants.filter((v) => v.id === variantId);
    }

    if (activeVariants.length === 0) {
      return { points: [], variants: [], currentLowestPrice: null };
    }

    const variantIds = activeVariants.map((v) => v.id);
    const rangeDate = getRangeDate(range);

    // Stage 2: Prepare the 2 independent queries to run concurrently
    let historyQuery = this.db
      .from('price_history')
      .select('price, scraped_at, store_id, variant_id')
      .in('variant_id', variantIds)
      .gte('scraped_at', rangeDate)
      .order('scraped_at', { ascending: true })
      .limit(1000); // Safe bounding cap

    if (storeId) {
      historyQuery = historyQuery.eq('store_id', storeId);
    }

    const lowestPriceQuery = this.db
      .from('prices')
      .select('price')
      .in('variant_id', variantIds)
      .eq('in_stock', true)
      .order('price', { ascending: true })
      .limit(1)
      .maybeSingle();

    // Execute history query and lowest-price query concurrently
    const [historyRes, lowestPriceRes] = await Promise.all([historyQuery, lowestPriceQuery]);

    if (historyRes.error) throw historyRes.error;
    if (lowestPriceRes.error) throw lowestPriceRes.error;

    return {
      points: historyRes.data ?? [],
      variants: activeVariants,
      currentLowestPrice: lowestPriceRes.data?.price ?? null,
    };
  }

  /** Retained for backward compatibility */
  async findByProductSlug(slug: string, range: HistoryRange, variantId?: string, storeId?: string) {
    const res = await this.getHistoryAndLowestPrice(slug, range, variantId, storeId);
    if (!res) return null;
    return { points: res.points, variants: res.variants };
  }

  /** Retained for backward compatibility */
  async getCurrentLowestPrice(variantIds: string[]) {
    if (variantIds.length === 0) return null;

    const { data, error } = await this.db
      .from('prices')
      .select('price')
      .in('variant_id', variantIds)
      .eq('in_stock', true)
      .order('price', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data?.price ?? null;
  }
}
