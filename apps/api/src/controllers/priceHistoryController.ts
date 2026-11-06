import { Request, Response, NextFunction } from 'express';
import { priceHistoryService } from '../services/priceHistoryService';
import { AppError } from '../middleware/errorHandler';

export const priceHistoryController = {
  getHistory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = req.params;
      const { range = '30d', variantId, storeId } = req.query;

      if (!['7d', '30d', '90d', '1y', 'all'].includes(range as string)) {
        throw { statusCode: 400, message: 'Invalid range. Use 7d, 30d, 90d, 1y, or all.' } as AppError;
      }

      const history = await priceHistoryService.getPriceHistory(
        slug, 
        range as any, 
        variantId as string | undefined, 
        storeId as string | undefined
      );
      
      res.json({ success: true, data: history });
    } catch (err) {
      next(err);
    }
  }
};
