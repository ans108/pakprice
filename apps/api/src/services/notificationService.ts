import logger from '../utils/logger';
import { supabase } from '../database/supabase';
import type { PriceAlert } from '@pakprice/shared';

export interface NotificationProvider {
  notifyPriceAlert(email: string, alert: PriceAlert, currentPrice: number, productName: string): Promise<void>;
}

export class ConsoleNotificationProvider implements NotificationProvider {
  async notifyPriceAlert(email: string, alert: PriceAlert, currentPrice: number, productName: string): Promise<void> {
    logger.info({
      email,
      alertId: alert.id,
      targetPrice: alert.target_price,
      currentPrice,
      productName
    }, '🔔 [MOCK EMAIL] Price Alert Triggered');
    
    console.log(`
=========================================
📩 EMAIL NOTIFICATION (MOCK)
To: ${email}
Subject: Price Drop Alert: ${productName}

Good news! The price for ${productName} has dropped to Rs. ${currentPrice}.
This meets your target price of Rs. ${alert.target_price}.
=========================================
    `);
  }
}

export class NotificationService {
  private provider: NotificationProvider;

  constructor(provider: NotificationProvider) {
    this.provider = provider;
  }

  async sendPriceAlert(alertId: string, userId: string, currentPrice: number) {
    if (!supabase) return;

    // Get alert and variant details
    const { data: alert, error: alertError } = await supabase
      .from('price_alerts')
      .select(`
        *,
        variant:product_variants(name, product:products(name))
      `)
      .eq('id', alertId)
      .maybeSingle();

    if (alertError || !alert) {
      logger.error({ alertError, alertId }, 'Failed to fetch alert details for notification');
      return;
    }

    // Get user email via admin API
    const { data: userResponse, error: userError } = await supabase.auth.admin.getUserById(userId);
    const email = userResponse?.user?.email;

    if (userError || !email) {
      logger.error({ userError, userId }, 'Failed to fetch user email for notification');
      return;
    }

    const productName = `${(alert as any).variant?.product?.name} - ${(alert as any).variant?.name}`;
    
    await this.provider.notifyPriceAlert(email, alert as unknown as PriceAlert, currentPrice, productName);
  }
}

// Default to console provider for Phase 4
export const notificationService = new NotificationService(new ConsoleNotificationProvider());
