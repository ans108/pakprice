import { SupabaseClient } from '@supabase/supabase-js';

export class BankOfferRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findActive(
    filters?: { storeId?: string; bankName?: string; cardType?: string },
    pagination?: { page?: number; limit?: number }
  ) {
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(Math.max(1, pagination?.limit ?? 50), 100);
    const offset = (page - 1) * limit;

    let query = this.db
      .from('bank_offers')
      .select('id, store_id, bank_name, card_type, discount_percent, cashback_percent, description, valid_from, valid_until, is_active, created_at, store:stores ( id, name, slug, logo_url, base_url )')
      .eq('is_active', true);

    // Only return non-expired offers
    const now = new Date().toISOString();
    query = query.or(`valid_until.is.null,valid_until.gte.${now}`);

    if (filters?.storeId) {
      query = query.eq('store_id', filters.storeId);
    }
    if (filters?.bankName) {
      query = query.ilike('bank_name', `%${filters.bankName}%`);
    }
    if (filters?.cardType) {
      query = query.ilike('card_type', `%${filters.cardType}%`);
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
