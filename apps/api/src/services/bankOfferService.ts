import { BankOfferRepository } from '../repositories/bankOfferRepository';
import { supabase } from '../database/supabase';

export class BankOfferService {
  private repository: BankOfferRepository;

  constructor() {
    this.repository = new BankOfferRepository(supabase!);
  }

  async getActiveOffers(
    filters?: { storeId?: string; bankName?: string; cardType?: string },
    pagination?: { page?: number; limit?: number }
  ) {
    return await this.repository.findActive(filters, pagination);
  }
}

export const bankOfferService = new BankOfferService();
