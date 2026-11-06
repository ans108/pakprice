import { SupabaseClient } from '@supabase/supabase-js';

export class SearchHistoryRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findByUserId(userId: string, options?: number | { page?: number; limit?: number }) {
    let page = 1;
    let limit = 20;

    if (typeof options === 'number') {
      limit = Math.min(Math.max(1, options), 50);
    } else if (options) {
      page = Math.max(1, options.page ?? 1);
      limit = Math.min(Math.max(1, options.limit ?? 20), 50);
    }

    const offset = (page - 1) * limit;

    const { data, error } = await this.db
      .from('search_history')
      .select('id, user_id, query, result_count, created_at')
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

  async create(userId: string, query: string, resultCount?: number) {
    const { data, error } = await this.db
      .from('search_history')
      .insert({ user_id: userId, query, result_count: resultCount })
      .select('id, user_id, query, result_count, created_at')
      .single();
    if (error) throw error;
    return data;
  }

  async deleteById(historyId: string, userId: string) {
    const { error, count } = await this.db
      .from('search_history')
      .delete({ count: 'exact' })
      .eq('id', historyId)
      .eq('user_id', userId);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async clearUserHistory(userId: string) {
    const { error } = await this.db
      .from('search_history')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  }
}
