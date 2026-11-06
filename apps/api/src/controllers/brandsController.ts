import { Request, Response } from 'express';
import { supabase, isSupabaseConfigured } from '../database/supabase';
import { ProductService } from '../services/productService';
import logger from '../utils/logger';
import { dbNotConfiguredResponse, internalErrorResponse } from '../utils/apiHelpers';

function getService(): ProductService {
  return new ProductService(supabase!);
}

export const brandsController = {
  /**
   * GET /api/v1/brands
   * Returns all brands ordered alphabetically.
   * No pagination — brand list is bounded and small.
   */
  async list(req: Request, res: Response): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      dbNotConfiguredResponse(res);
      return;
    }

    try {
      const service = getService();
      const brands = await service.getBrands();

      res.status(200).json({
        success: true,
        data: brands,
        meta: { total: brands.length },
      });
    } catch (err) {
      logger.error({ err }, 'brandsController.list failed');
      internalErrorResponse(res);
    }
  },
};
