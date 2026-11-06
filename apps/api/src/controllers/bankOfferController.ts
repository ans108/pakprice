import { Request, Response, NextFunction } from 'express';
import { bankOfferService } from '../services/bankOfferService';

export const bankOfferController = {
  getOffers: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, bankName, cardType, page, limit } = req.query;
      const p = page ? parseInt(String(page), 10) : undefined;
      const l = limit ? parseInt(String(limit), 10) : undefined;
      const result = await bankOfferService.getActiveOffers(
        {
          storeId: storeId as string | undefined,
          bankName: bankName as string | undefined,
          cardType: cardType as string | undefined
        },
        { page: p, limit: l }
      );
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  }
};
