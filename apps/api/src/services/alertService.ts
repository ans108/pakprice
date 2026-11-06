import { AlertRepository } from '../repositories/alertRepository';
import { supabase } from '../database/supabase';
import { AppError } from '../middleware/errorHandler';

export class AlertService {
  private repository: AlertRepository;

  constructor() {
    this.repository = new AlertRepository(supabase!);
  }

  async getAlerts(userId: string, pagination?: { page?: number; limit?: number }) {
    return await this.repository.findByUserId(userId, pagination);
  }

  async getAlert(alertId: string) {
    return await this.repository.findById(alertId);
  }

  async createAlert(userId: string, variantId: string, targetPrice: number) {
    if (targetPrice <= 0) {
      throw { statusCode: 400, message: 'Target price must be greater than 0' } as AppError;
    }

    const exists = await this.repository.variantExists(variantId);
    if (!exists) {
      throw { statusCode: 404, message: 'Variant not found' } as AppError;
    }

    try {
      return await this.repository.create(userId, variantId, targetPrice);
    } catch (err: any) {
      if (err.code === '23505') {
        throw { statusCode: 409, message: 'An alert already exists for this variant. Please update it instead.' } as AppError;
      }
      throw err;
    }
  }

  async updateAlert(alertId: string, userId: string, targetPrice?: number, isActive?: boolean) {
    if (targetPrice !== undefined && targetPrice <= 0) {
      throw { statusCode: 400, message: 'Target price must be greater than 0' } as AppError;
    }

    const updates: { target_price?: number; is_active?: boolean; triggered_at?: string | null } = {};
    if (targetPrice !== undefined) {
      updates.target_price = targetPrice;
      updates.triggered_at = null;
    }
    if (isActive !== undefined) {
      updates.is_active = isActive;
      if (isActive) {
        updates.triggered_at = null;
      }
    }

    const updated = await this.repository.update(alertId, userId, updates);
    if (!updated) {
      throw { statusCode: 404, message: 'Alert not found or access denied' } as AppError;
    }
    return updated;
  }

  async deleteAlert(alertId: string, userId: string) {
    const deleted = await this.repository.deleteById(alertId, userId);
    if (!deleted) {
      throw { statusCode: 404, message: 'Alert not found or access denied' } as AppError;
    }
  }
}

export const alertService = new AlertService();
