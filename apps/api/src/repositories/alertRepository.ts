import { SupabaseClient } from '@supabase/supabase-js';

export class AlertRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findByUserId(userId: string, pagination?: { page?: number; limit?: number }) {
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(Math.max(1, pagination?.limit ?? 20), 50);
    const offset = (page - 1) * limit;

    const { data, error } = await this.db
      .from('price_alerts')
      .select(`
        id, user_id, variant_id, target_price, is_active, triggered_at, created_at,
        variant:product_variants (
          id, product_id, name, image_url,
          product:products ( id, name, slug, image_url ),
          prices ( price, in_stock )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit);

    if (error) throw error;

    const rawRows = data ?? [];
    const hasMore = rawRows.length > limit;
    const items = hasMore ? rawRows.slice(0, limit) : rawRows;

    return {
      items,
      pagination: {
        page,
        limit,
        hasMore,
      },
    };
  }

  async findById(alertId: string) {
    const { data, error } = await this.db
      .from('price_alerts')
      .select('*')
      .eq('id', alertId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async create(userId: string, variantId: string, targetPrice: number) {
    const { data, error } = await this.db
      .from('price_alerts')
      .insert({ user_id: userId, variant_id: variantId, target_price: targetPrice })
      .select('id, user_id, variant_id, target_price, is_active, triggered_at, created_at')
      .single();
    if (error) throw error;
    return data;
  }

  async update(alertId: string, userId: string, updates: { target_price?: number; is_active?: boolean }) {
    const { data, error } = await this.db
      .from('price_alerts')
      .update(updates)
      .eq('id', alertId)
      .eq('user_id', userId)
      .select('id, user_id, variant_id, target_price, is_active, triggered_at, created_at')
      .single();
    if (error) throw error;
    return data;
  }

  async deleteById(alertId: string, userId: string) {
    const { error, count } = await this.db
      .from('price_alerts')
      .delete({ count: 'exact' })
      .eq('id', alertId)
      .eq('user_id', userId);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async variantExists(variantId: string) {
    const { data, error } = await this.db
      .from('product_variants')
      .select('id')
      .eq('id', variantId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  /** Find all active, untriggered alerts */
  async findActiveAlerts() {
    const { data, error } = await this.db
      .from('price_alerts')
      .select('id, user_id, variant_id, target_price, triggered_at')
      .eq('is_active', true)
      .is('triggered_at', null);
    if (error) throw error;
    return data ?? [];
  }

  /**
   * Atomically claim and deactivate an alert for triggering.
   * Returns the updated alert only if it was active and untriggered at the exact moment of execution.
   */
  async claimAndTriggerAlert(alertId: string): Promise<any | null> {
    const { data, error } = await this.db
      .from('price_alerts')
      .update({
        is_active: false,
        triggered_at: new Date().toISOString()
      })
      .eq('id', alertId)
      .eq('is_active', true)
      .is('triggered_at', null)
      .select('id, user_id, variant_id, target_price, is_active, triggered_at')
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Atomically claim and deactivate all matching alerts for a variant where target_price >= currentPrice.
   * Prevents duplicate alert triggering across overlapping scraper runs.
   */
  async claimAndTriggerMatchingAlerts(variantId: string, currentPrice: number): Promise<any[]> {
    const { data, error } = await this.db
      .from('price_alerts')
      .update({
        is_active: false,
        triggered_at: new Date().toISOString()
      })
      .eq('variant_id', variantId)
      .gte('target_price', currentPrice)
      .eq('is_active', true)
      .is('triggered_at', null)
      .select('id, user_id, variant_id, target_price, is_active, triggered_at');

    if (error) throw error;
    return data ?? [];
  }

  async setTriggered(alertId: string) {
    const { error } = await this.db
      .from('price_alerts')
      .update({
        is_active: false,
        triggered_at: new Date().toISOString()
      })
      .eq('id', alertId);
    if (error) throw error;
  }
}
