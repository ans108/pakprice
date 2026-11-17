import logger from '../utils/logger';
import { supabase } from '../database/supabase';
import type { PriceAlert } from '@pakprice/shared';

export interface NotificationProvider {
  notifyPriceAlert(
    email: string,
    alert: PriceAlert,
    currentPrice: number,
    productName: string,
    productUrl?: string
  ): Promise<void>;
}

export class ConsoleNotificationProvider implements NotificationProvider {
  async notifyPriceAlert(
    email: string,
    alert: PriceAlert,
    currentPrice: number,
    productName: string,
    productUrl?: string
  ): Promise<void> {
    logger.info(
      {
        email,
        alertId: alert.id,
        targetPrice: alert.target_price,
        currentPrice,
        productName,
        productUrl,
      },
      '🔔 [MOCK EMAIL] Price Alert Triggered'
    );

    console.log(`
=========================================
📩 EMAIL NOTIFICATION (CONSOLE FALLBACK)
To: ${email}
Subject: Price Drop Alert: ${productName}
Price: Rs. ${currentPrice.toLocaleString()} (Target: Rs. ${alert.target_price.toLocaleString()})
Link: ${productUrl || 'https://pakprice.pk'}
=========================================
    `);
  }
}

export class ResendEmailNotificationProvider implements NotificationProvider {
  private apiKey: string;
  private fromAddress: string;
  private fallbackConsole: ConsoleNotificationProvider;

  constructor(apiKey: string, fromAddress = 'PakPrice Alerts <alerts@pakprice.pk>') {
    this.apiKey = apiKey;
    this.fromAddress = fromAddress;
    this.fallbackConsole = new ConsoleNotificationProvider();
  }

  async notifyPriceAlert(
    email: string,
    alert: PriceAlert,
    currentPrice: number,
    productName: string,
    productUrl?: string
  ): Promise<void> {
    const savings = Math.max(0, alert.target_price - currentPrice);
    const link = productUrl || `https://pakprice.pk/products`;

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
      <a href="${link}" class="cta-button">View Live Deal on PakPrice ↗</a>
    </div>
    <div class="footer">
      Sent by PakPrice.pk · Pakistan's Real-Time Price Comparison Engine
    </div>
  </div>
</body>
</html>
    `.trim();

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [email],
          subject: `Price Drop Alert: ${productName} is now Rs. ${currentPrice.toLocaleString()}`,
          html,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(
          { status: response.status, errorText },
          'Resend API returned non-OK response. Falling back to console log.'
        );
        await this.fallbackConsole.notifyPriceAlert(email, alert, currentPrice, productName, productUrl);
        return;
      }

      logger.info({ email, productName, currentPrice }, 'Successfully dispatched live price alert email via Resend API');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Resend API request failed. Falling back to console log.');
      await this.fallbackConsole.notifyPriceAlert(email, alert, currentPrice, productName, productUrl);
    }
  }
}

export class NotificationService {
  private provider: NotificationProvider;

  constructor(provider: NotificationProvider) {
    this.provider = provider;
  }

  async sendPriceAlert(alertId: string, userId: string, currentPrice: number, productUrl?: string): Promise<void> {
    if (!supabase) return;

    // Get alert and variant details
    const { data: alert, error: alertError } = await supabase
      .from('price_alerts')
      .select(`
        *,
        variant:product_variants(name, product:products(name, slug))
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

    const prod = (alert as any).variant?.product;
    const variantName = (alert as any).variant?.name;
    const productName = prod?.name ? `${prod.name} (${variantName || 'Default'})` : 'Product';
    const link = productUrl || (prod?.slug ? `https://pakprice.pk/products/${prod.slug}` : undefined);

    await this.provider.notifyPriceAlert(email, alert as unknown as PriceAlert, currentPrice, productName, link);
  }
}

// Active provider selection: Resend API if configured, otherwise console fallback
const activeProvider: NotificationProvider = process.env.RESEND_API_KEY
  ? new ResendEmailNotificationProvider(
      process.env.RESEND_API_KEY,
      process.env.EMAIL_FROM || 'PakPrice Alerts <alerts@pakprice.pk>'
    )
  : new ConsoleNotificationProvider();

export const notificationService = new NotificationService(activeProvider);
