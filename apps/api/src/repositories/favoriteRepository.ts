import { SupabaseClient } from '@supabase/supabase-js';

export class FavoriteRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findByUserId(userId: string, pagination?: { page?: number; limit?: number }) {
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(Math.max(1, pagination?.limit ?? 20), 50);
    const offset = (page - 1) * limit;

    // Query limit + 1 to compute hasMore without full table COUNT
    const { data, error } = await this.db
      .from('favorites')
      .select(`
        id, user_id, variant_id, created_at,
        variant:product_variants (
          id, product_id, name, ram_gb, storage_gb, color, image_url, is_active,
          product:products ( id, name, slug, image_url ),
          prices (
            price, original_price, in_stock,
            store:stores ( id, name, slug, logo_url )
          )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit);

    if (error) throw error;

    const rawRows = data ?? [];
    const hasMore = rawRows.length > limit;
    const rows = hasMore ? rawRows.slice(0, limit) : rawRows;

    const items = rows.map((fav: any) => {
      const prices = fav.variant?.prices || [];
      const inStockPrices = prices.filter((p: any) => p.in_stock && p.price > 0);
      const candidates = inStockPrices.length > 0 ? inStockPrices : prices;

      let lowestPrice: number | null = null;
      let sourceStore: { id: string; name: string; slug: string; logo_url: string | null } | null = null;
      let inStock = false;

      if (candidates.length > 0) {
        candidates.sort((a: any, b: any) => a.price - b.price);
        lowestPrice = candidates[0].price;
        sourceStore = candidates[0].store ?? null;
        inStock = candidates.some((p: any) => p.in_stock);
      }

      return {
        id: fav.id,
        user_id: fav.user_id,
        variant_id: fav.variant_id,
        created_at: fav.created_at,
        variant: fav.variant,
        product: fav.variant?.product ?? null,
        lowest_price: lowestPrice,
        source_store: sourceStore,
        in_stock: inStock,
      };
    });

    return {
      items,
      pagination: {
        page,
        limit,
        hasMore,
      },
    };
  }

  async findOne(userId: string, variantId: string) {
    const { data, error } = await this.db
      .from('favorites')
      .select('id, user_id, variant_id, created_at')
      .eq('user_id', userId)
      .eq('variant_id', variantId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async create(userId: string, variantId: string) {
    const { data, error } = await this.db
      .from('favorites')
      .insert({ user_id: userId, variant_id: variantId })
      .select('id, user_id, variant_id, created_at')
      .single();
    if (error) throw error;
    return data;
  }

  async deleteByVariant(userId: string, variantId: string) {
    const { error, count } = await this.db
      .from('favorites')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('variant_id', variantId);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

}
