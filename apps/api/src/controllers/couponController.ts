import { Request, Response, NextFunction } from 'express';
import { couponService } from '../services/couponService';

export const couponController = {
  getCoupons: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, page, limit } = req.query;
      const p = page ? parseInt(String(page), 10) : undefined;
      const l = limit ? parseInt(String(limit), 10) : undefined;
      const result = await couponService.getActiveCoupons(storeId as string | undefined, { page: p, limit: l });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  }
};
