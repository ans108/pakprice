import { Request, Response, NextFunction } from 'express';
import { SearchHistoryRepository } from '../repositories/searchHistoryRepository';
import { supabase } from '../database/supabase';
import { AppError } from '../middleware/errorHandler';

const searchHistoryRepo = new SearchHistoryRepository(supabase!);

export const searchHistoryController = {
  getHistory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const result = await searchHistoryRepo.findByUserId(req.user!.id, { page, limit });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  },

  addHistory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query, resultCount } = req.body;
      if (!query || typeof query !== 'string' || !query.trim()) {
        throw { statusCode: 400, message: 'query string is required' } as AppError;
      }

      const normalizedQuery = query.trim().replace(/\s+/g, ' ');
      const history = await searchHistoryRepo.create(req.user!.id, normalizedQuery, resultCount);
      res.status(201).json({ success: true, data: history });
    } catch (err) {
      next(err);
    }
  },

  deleteHistoryItem: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const deleted = await searchHistoryRepo.deleteById(id, req.user!.id);
      if (!deleted) {
        throw { statusCode: 404, message: 'History item not found or access denied' } as AppError;
      }
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  clearAllHistory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.query;
      if (id) {
        const deleted = await searchHistoryRepo.deleteById(id as string, req.user!.id);
        if (!deleted) {
          throw { statusCode: 404, message: 'History item not found or access denied' } as AppError;
        }
      } else {
        await searchHistoryRepo.clearUserHistory(req.user!.id);
      }
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  }
};
