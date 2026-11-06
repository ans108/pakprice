import { CouponRepository } from '../repositories/couponRepository';
import { supabase } from '../database/supabase';

export class CouponService {
  private repository: CouponRepository;

  constructor() {
    this.repository = new CouponRepository(supabase!);
  }

  async getActiveCoupons(storeId?: string, pagination?: { page?: number; limit?: number }) {
    return await this.repository.findActive(storeId, pagination);
  }
}

export const couponService = new CouponService();
