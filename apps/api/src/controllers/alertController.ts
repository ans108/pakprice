import { Request, Response, NextFunction } from 'express';
import { alertService } from '../services/alertService';
import { AppError } from '../middleware/errorHandler';

export const alertController = {
  getAlerts: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const result = await alertService.getAlerts(req.user!.id, { page, limit });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  },

  createAlert: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { variantId, targetPrice } = req.body;
      if (!variantId || targetPrice === undefined) {
        throw { statusCode: 400, message: 'variantId and targetPrice are required' } as AppError;
      }
      
      const alert = await alertService.createAlert(req.user!.id, variantId, Number(targetPrice));
      res.status(201).json({ success: true, data: alert });
    } catch (err) {
      next(err);
    }
  },

  updateAlert: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { targetPrice, isActive } = req.body;
      
      const alert = await alertService.updateAlert(
        id, 
        req.user!.id, 
        targetPrice !== undefined ? Number(targetPrice) : undefined, 
        isActive !== undefined ? Boolean(isActive) : undefined
      );
      
      res.json({ success: true, data: alert });
    } catch (err) {
      next(err);
    }
  },

  deleteAlert: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      await alertService.deleteAlert(id, req.user!.id);
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  }
};
