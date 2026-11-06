import { Request, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../database/supabase';
import { ProfileRepository } from '../repositories/profileRepository';
import { AppError } from '../middleware/errorHandler';

const profileRepo = new ProfileRepository(supabase!);

export const profileController = {
  getProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const profile = await profileRepo.findByUserId(userId);
      
      if (!profile) {
        throw { statusCode: 404, message: 'Profile not found' } as AppError;
      }
      
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  },

  updateProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { display_name, avatar_url } = req.body;
      
      const profile = await profileRepo.updateProfile(userId, { display_name, avatar_url });
      
      if (!profile) {
        throw { statusCode: 404, message: 'Profile not found' } as AppError;
      }
      
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }
};
