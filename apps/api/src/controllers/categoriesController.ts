import { Request, Response } from 'express';
import { supabase, isSupabaseConfigured } from '../database/supabase';
import { ProductService } from '../services/productService';
import logger from '../utils/logger';
import { dbNotConfiguredResponse, internalErrorResponse } from '../utils/apiHelpers';

function getService(): ProductService {
  return new ProductService(supabase!);
}

export const categoriesController = {
  /**
   * GET /api/v1/categories
   * Returns all categories ordered by sort_order (root categories first,
   * then sub-categories within each parent).
   * No pagination — category list is bounded and small.
   */
  async list(req: Request, res: Response): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      dbNotConfiguredResponse(res);
      return;
    }

    try {
      const service = getService();
      const categories = await service.getCategories();

      res.status(200).json({
        success: true,
        data: categories,
        meta: { total: categories.length },
      });
    } catch (err) {
      logger.error({ err }, 'categoriesController.list failed');
      internalErrorResponse(res);
    }
  },
};
