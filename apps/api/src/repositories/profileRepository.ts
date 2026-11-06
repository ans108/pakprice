import { SupabaseClient } from '@supabase/supabase-js';

export class ProfileRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findByUserId(userId: string) {
    const { data, error } = await this.db
      .from('user_profiles')
      .select('id, display_name, avatar_url, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async updateProfile(userId: string, updates: { display_name?: string; avatar_url?: string | null }) {
    const { data, error } = await this.db
      .from('user_profiles')
      .update(updates)
      .eq('id', userId)
      .select('id, display_name, avatar_url, created_at, updated_at')
      .single();
    if (error) throw error;
    return data;
  }
}
