import { FavoriteRepository } from '../repositories/favoriteRepository';
import { supabase } from '../database/supabase';
import { AppError } from '../middleware/errorHandler';

export class FavoriteService {
  private repository: FavoriteRepository;

  constructor() {
    this.repository = new FavoriteRepository(supabase!);
  }

  async getFavorites(userId: string, pagination?: { page?: number; limit?: number }) {
    return await this.repository.findByUserId(userId, pagination);
  }

  async addFavorite(userId: string, variantId: string) {
    if (!variantId || typeof variantId !== 'string') {
      throw { statusCode: 400, message: 'variantId is required' } as AppError;
    }

    const existing = await this.repository.findOne(userId, variantId);
    if (existing) {
      return existing; // Idempotent
    }

    try {
      return await this.repository.create(userId, variantId);
    } catch (err: any) {
      if (err.code === '23505') { // unique violation
        return await this.repository.findOne(userId, variantId);
      }
      throw err;
    }
  }

  async removeFavorite(userId: string, variantId: string) {
    return await this.repository.deleteByVariant(userId, variantId);
  }
}

export const favoriteService = new FavoriteService();
