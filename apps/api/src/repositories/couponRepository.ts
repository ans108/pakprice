import { SupabaseClient } from '@supabase/supabase-js';

export class CouponRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findActive(storeId?: string, pagination?: { page?: number; limit?: number }) {
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(Math.max(1, pagination?.limit ?? 50), 100);
    const offset = (page - 1) * limit;

    let query = this.db
      .from('coupons')
      .select('id, store_id, code, description, discount_type, discount_value, min_order, valid_from, valid_until, is_active, created_at, store:stores ( id, name, slug, logo_url, base_url )')
      .eq('is_active', true);

    // Only return non-expired coupons
    const now = new Date().toISOString();
    query = query.or(`valid_until.is.null,valid_until.gte.${now}`);

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    query = query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit);

    const { data, error } = await query;
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
}
