import { SupabaseClient } from '@supabase/supabase-js';
import { PriceHistoryRepository } from '../repositories/priceHistoryRepository';
import { supabase } from '../database/supabase';
import { AppError } from '../middleware/errorHandler';
import { memoryCache, CACHE_NOT_FOUND } from '../utils/memoryCache';
import type { PriceHistoryPoint } from '@pakprice/shared';

export class PriceHistoryService {
  private repository: PriceHistoryRepository;
  private db: SupabaseClient;

  constructor(dbClient?: SupabaseClient) {
    this.db = dbClient || supabase!;
    this.repository = new PriceHistoryRepository(this.db);
  }

  /**
   * Helper to resolve store names efficiently using the in-memory reference cache.
   * Prevents repeating store joins across hundreds of history point rows.
   */
  private async getStoreNameMap(): Promise<Map<string, string>> {
    const cached = memoryCache.get<Map<string, string>>('reference', 'stores_map');
    if (cached !== undefined && cached !== CACHE_NOT_FOUND) {
      return cached;
    }

    const { data, error } = await this.db
      .from('stores')
      .select('id, name');

    const map = new Map<string, string>();
    if (!error && data) {
      for (const s of data) {
        map.set(s.id, s.name);
      }
    }

    memoryCache.set('reference', 'stores_map', map);
    return map;
  }

  async getPriceHistory(
    slug: string,
    range: '7d' | '30d' | '90d' | '1y' | 'all',
    variantId?: string,
    storeId?: string
  ) {
    const result = await this.repository.getHistoryAndLowestPrice(slug, range, variantId, storeId);

    if (!result) {
      throw { statusCode: 404, message: 'Product not found' } as AppError;
    }

    const { points: rawPoints, currentLowestPrice } = result;

    if (rawPoints.length === 0) {
      return {
        range,
        points: [],
        lowestPrice: null,
        highestPrice: null,
        currentLowestPrice,
      };
    }

    const storeNameMap = await this.getStoreNameMap();

    let lowestPrice = rawPoints[0].price;
    let highestPrice = rawPoints[0].price;

    const points: PriceHistoryPoint[] = rawPoints.map((p) => {
      if (p.price < lowestPrice) lowestPrice = p.price;
      if (p.price > highestPrice) highestPrice = p.price;

      return {
        date: p.scraped_at,
        price: p.price,
        storeId: p.store_id,
        storeName: storeNameMap.get(p.store_id) || 'Unknown Store',
      };
    });

    return {
      range,
      points,
      lowestPrice,
      highestPrice,
      currentLowestPrice,
      scope: {
        variantId: variantId || null,
        storeId: storeId || null,
        storeName: storeId ? storeNameMap.get(storeId) || null : null,
      },
    };
  }
}

export const priceHistoryService = new PriceHistoryService();
