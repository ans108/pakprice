import { Request, Response, NextFunction } from 'express';
import { favoriteService } from '../services/favoriteService';
import { AppError } from '../middleware/errorHandler';

export const favoriteController = {
  getFavorites: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const result = await favoriteService.getFavorites(req.user!.id, { page, limit });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  },

  addFavorite: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { variantId } = req.body;
      if (!variantId || typeof variantId !== 'string') {
        throw { statusCode: 400, message: 'variantId is required' } as AppError;
      }
      const favorite = await favoriteService.addFavorite(req.user!.id, variantId.trim());
      res.status(201).json({ success: true, data: favorite });
    } catch (err) {
      next(err);
    }
  },

  removeFavorite: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { variantId } = req.params;
      const removed = await favoriteService.removeFavorite(req.user!.id, variantId);
      
      if (!removed) {
        throw { statusCode: 404, message: 'Favorite not found' } as AppError;
      }
      
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  }
};
