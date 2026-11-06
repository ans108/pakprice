import { Request, Response } from 'express';
import { supabase, isSupabaseConfigured } from '../database/supabase';
import logger from '../utils/logger';

export const storesController = {
  /**
   * GET /api/v1/stores
   * Returns all active stores ordered by sort_order.
   * Requires Supabase to be configured; returns 503 otherwise.
   */
  async list(req: Request, res: Response): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      res.status(503).json({
        success: false,
        error: 'Database Not Configured',
        message:
          'Supabase environment variables are not set. ' +
          'Copy apps/api/.env.example to apps/api/.env and fill in your Supabase credentials.',
        statusCode: 503,
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('stores')
        .select(
          'id, name, slug, base_url, logo_url, scraper_key, is_active, sort_order, created_at, updated_at'
        )
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        logger.error({ err: error }, 'Failed to fetch stores from Supabase');
        res.status(500).json({
          success: false,
          error: 'Database Error',
          message: 'Failed to fetch stores. Please try again later.',
          statusCode: 500,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: data ?? [],
        meta: {
          total: data?.length ?? 0,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Unexpected error in storesController.list');
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred.',
        statusCode: 500,
      });
    }
  },
};
