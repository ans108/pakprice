import { createClient } from '@supabase/supabase-js';
import { scraperConfig } from '../config/scraperConfig';
import { Price, PriceHistory } from '@pakprice/shared';

const supabase = createClient(scraperConfig.supabaseUrl, scraperConfig.supabaseServiceKey);

export class PriceRepository {
  /**
   * Get the current price row for a specific (variant_id, store_id).
   * Used by 5C outlier detection to compare against the previous valid observation.
   */
  async getCurrentPrice(variantId: string, storeId: string): Promise<{ price: number; original_price: number | null } | null> {
    const { data, error } = await supabase
      .from('prices')
      .select('price, original_price')
      .eq('variant_id', variantId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (error || !data) return null;
    return { price: data.price, original_price: data.original_price };
  }

  /**
   * Get the latest price history entry for a specific (variant_id, store_id).
   * Used by 5C history deduplication.
   * Deterministic ordering: scraped_at DESC, id DESC.
   */
  async getLatestHistoryEntry(variantId: string, storeId: string): Promise<{
    price: number;
    original_price: number | null;
    shipping_fee: number;
    in_stock: boolean;
    scraped_at: string;
  } | null> {
    const { data, error } = await supabase
      .from('price_history')
      .select('price, original_price, shipping_fee, in_stock, scraped_at, id')
      .eq('variant_id', variantId)
      .eq('store_id', storeId)
      .order('scraped_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return {
      price: data.price,
      original_price: data.original_price,
      shipping_fee: data.shipping_fee,
      in_stock: data.in_stock,
      scraped_at: data.scraped_at,
    };
  }

  async upsertCurrentPrice(priceData: Omit<Price, 'id' | 'created_at' | 'updated_at' | 'final_price'>): Promise<void> {
    const { error } = await supabase.from('prices').upsert({
      ...priceData,
      last_scraped_at: new Date().toISOString(),
    }, {
      onConflict: 'variant_id,store_id'
    });

    if (error) {
      console.error('Failed to upsert current price:', error);
      throw error;
    }
  }

  async insertPriceHistory(
    variantId: string,
    storeId: string,
    price: number,
    originalPrice: number | null,
    shippingFee: number,
    inStock: boolean
  ): Promise<void> {
    const { error } = await supabase.from('price_history').insert({
      variant_id: variantId,
      store_id: storeId,
      price,
      original_price: originalPrice,
      shipping_fee: shippingFee,
      in_stock: inStock,
      scraped_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Failed to insert price history:', error);
      throw error;
    }
  }

  /**
   * Atomically claims and deactivates matching alerts for a variant where target_price >= currentListedPrice.
   * Atomic UPDATE ensures overlapping scraper runs will not trigger duplicate notifications.
   */
  async claimMatchingAlerts(variantId: string, currentListedPrice: number) {
    const { data, error } = await supabase
      .from('price_alerts')
      .update({
        is_active: false,
        triggered_at: new Date().toISOString(),
      })
      .eq('variant_id', variantId)
      .gte('target_price', currentListedPrice)
      .eq('is_active', true)
      .is('triggered_at', null)
      .select(`
        id, user_id, variant_id, target_price,
        variant:product_variants (
          name,
          product:products ( name )
        )
      `);

    if (error) {
      console.error('Failed to claim matching alerts:', error);
      return [];
    }

    return data ?? [];
  }
}

