import { logger } from '../scrapers/base/BaseScraper';
import { createClient } from '@supabase/supabase-js';
import { scraperConfig } from '../config/scraperConfig';
import type { PriceAlert } from '@pakprice/shared';

const supabase = scraperConfig.supabaseUrl && scraperConfig.supabaseServiceKey
  ? createClient(scraperConfig.supabaseUrl, scraperConfig.supabaseServiceKey)
  : null;

export interface AlertNotificationPayload {
  alert: PriceAlert & { variant?: { name: string; product?: { name: string; slug?: string } } };
  currentPrice: number;
  productName: string;
  productUrl?: string;
}

export class AlertNotificationDispatcher {
  private resendApiKey: string | undefined;
  private fromAddress: string;

  constructor() {
    this.resendApiKey = process.env.RESEND_API_KEY;
    this.fromAddress = process.env.EMAIL_FROM || 'PakPrice Alerts <alerts@pakprice.pk>';
  }

  /**
   * Dispatches notifications for an array of claimed price alerts.
   * Sends real branded HTML emails via Resend API when configured;
   * otherwise logs cleanly to the console.
   */
  async dispatchAlerts(
    claimedAlerts: any[],
    currentPrice: number,
    fallbackProductName?: string,
    fallbackProductUrl?: string
  ): Promise<{ dispatched: number; failed: number }> {
    let dispatched = 0;
    let failed = 0;

    for (const alert of claimedAlerts) {
      try {
        const prod = alert.variant?.product;
        const variantName = alert.variant?.name;
        const productName = prod?.name
          ? `${prod.name} (${variantName || 'Default'})`
          : fallbackProductName || 'Product';
        const productUrl =
          fallbackProductUrl ||
          (prod?.slug ? `https://pakprice.pk/products/${prod.slug}` : undefined);

        // Fetch user email if userId is present
        let userEmail: string | undefined;
        if (alert.user_id && supabase) {
          const { data: userResp } = await supabase.auth.admin.getUserById(alert.user_id);
          userEmail = userResp?.user?.email;
        }

        const recipient = userEmail || alert.email || 'user@example.com';
        const savings = Math.max(0, alert.target_price - currentPrice);

        if (this.resendApiKey && recipient && recipient !== 'user@example.com') {
          // Send via Resend API
          const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #111827; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #059669; padding: 24px 32px; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .content { padding: 32px; }
    .product-title { font-size: 18px; font-weight: 700; color: #111827; margin: 0 0 16px 0; }
    .price-box { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center; }
    .current-price { font-size: 28px; font-weight: 800; color: #047857; margin: 0; }
    .target-price { font-size: 13px; color: #065f46; margin-top: 4px; }
    .savings-badge { display: inline-block; background: #10b981; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-top: 8px; }
    .cta-button { display: block; text-align: center; background: #059669; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 14px; margin-top: 24px; }
    .footer { padding: 20px 32px; background: #f9fafb; border-top: 1px solid #f3f4f6; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔔 Price Drop Alert!</h1>
    </div>
    <div class="content">
      <h2 class="product-title">${productName}</h2>
      <p style="color: #4b5563; font-size: 14px; margin-top: 0;">Good news! A verified price for this product has dropped below your alert threshold.</p>
      <div class="price-box">
        <div class="current-price">Rs. ${currentPrice.toLocaleString()}</div>
        <div class="target-price">Your Target: Rs. ${alert.target_price.toLocaleString()}</div>
        ${savings > 0 ? `<div class="savings-badge">You save Rs. ${savings.toLocaleString()}!</div>` : ''}
      </div>
      <a href="${productUrl || 'https://pakprice.pk'}" class="cta-button">View Live Deal on PakPrice ↗</a>
    </div>
    <div class="footer">
      Sent by PakPrice.pk · Pakistan's Real-Time Price Comparison Engine
    </div>
  </div>
</body>
</html>
          `.trim();

          const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: this.fromAddress,
              to: [recipient],
              subject: `Price Drop Alert: ${productName} is now Rs. ${currentPrice.toLocaleString()}`,
              html,
            }),
          });

          if (!resp.ok) {
            const errBody = await resp.text();
            logger.warn({ status: resp.status, errBody }, 'Resend API error; falling back to console log');
            this.logConsoleAlert(recipient, alert.id, alert.target_price, currentPrice, productName, productUrl);
          } else {
            logger.info({ alertId: alert.id, recipient, currentPrice }, 'Dispatched live price alert via Resend');
          }
        } else {
          // Console fallback
          this.logConsoleAlert(recipient, alert.id, alert.target_price, currentPrice, productName, productUrl);
        }

        dispatched++;
      } catch (err: any) {
        logger.error({ alertId: alert.id, err: err.message }, 'Failed to dispatch price alert notification');
        failed++;
      }
    }

    return { dispatched, failed };
  }

  private logConsoleAlert(
    email: string,
    alertId: string,
    targetPrice: number,
    currentPrice: number,
    productName: string,
    productUrl?: string
  ): void {
    logger.info(
      {
        email,
        alertId,
        targetPrice,
        currentPrice,
        productName,
        productUrl,
      },
      '🔔 [PRICE ALERT DISPATCHED] Email notification logged (console)'
    );

    console.log(`
=========================================
📩 PRICE ALERT NOTIFICATION (CONSOLE)
To: ${email}
Product: ${productName}
Current Price: Rs. ${currentPrice.toLocaleString()}
Target Price: Rs. ${targetPrice.toLocaleString()}
URL: ${productUrl || 'https://pakprice.pk'}
=========================================
    `);
  }
}

export const alertNotificationDispatcher = new AlertNotificationDispatcher();
