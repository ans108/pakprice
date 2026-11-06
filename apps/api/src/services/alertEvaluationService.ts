import { AlertRepository } from '../repositories/alertRepository';
import { PriceHistoryRepository } from '../repositories/priceHistoryRepository';
import { notificationService } from './notificationService';
import { supabase } from '../database/supabase';
import logger from '../utils/logger';

export class AlertEvaluationService {
  private alertRepo: AlertRepository;
  private priceHistoryRepo: PriceHistoryRepository;

  constructor() {
    this.alertRepo = new AlertRepository(supabase!);
    this.priceHistoryRepo = new PriceHistoryRepository(supabase!);
  }

  /**
   * Evaluates active alerts for a specific variant whose price was just ingested.
   * Atomically claims matching alerts (setting is_active = false, triggered_at = NOW())
   * so overlapping scraper runs cannot trigger duplicate notifications.
   */
  async evaluateAlertsForVariant(variantId: string, currentPrice: number): Promise<number> {
    if (!supabase) return 0;

    try {
      const claimedAlerts = await this.alertRepo.claimAndTriggerMatchingAlerts(variantId, currentPrice);

      for (const alert of claimedAlerts) {
        logger.info(
          { alertId: alert.id, target: alert.target_price, current: currentPrice, variantId },
          'Alert target reached (claimed atomically)!'
        );
        await notificationService.sendPriceAlert(alert.id, alert.user_id, currentPrice);
      }

      return claimedAlerts.length;
    } catch (error) {
      logger.error({ error, variantId }, 'Failed to evaluate alerts for variant');
      return 0;
    }
  }

  /**
   * Evaluates all active alerts. Should be called after price ingestion.
   */
  async evaluateActiveAlerts() {
    if (!supabase) return;

    logger.info('Starting price alert evaluation...');
    try {
      const activeAlerts = await this.alertRepo.findActiveAlerts();
      
      let triggeredCount = 0;

      for (const alert of activeAlerts) {
        // Find current lowest listed price for this variant
        const currentLowest = await this.priceHistoryRepo.getCurrentLowestPrice([alert.variant_id]);

        if (currentLowest !== null && currentLowest <= alert.target_price) {
          // Atomically claim this alert
          const claimed = await this.alertRepo.claimAndTriggerAlert(alert.id);
          if (claimed) {
            logger.info({ alertId: alert.id, target: alert.target_price, current: currentLowest }, 'Alert target reached!');
            await notificationService.sendPriceAlert(alert.id, alert.user_id, currentLowest);
            triggeredCount++;
          }
        }
      }

      logger.info({ evaluated: activeAlerts.length, triggered: triggeredCount }, 'Price alert evaluation complete');
    } catch (error) {
      logger.error({ error }, 'Failed to evaluate price alerts');
    }
  }
}

export const alertEvaluationService = new AlertEvaluationService();
