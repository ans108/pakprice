import { Browser, BrowserContext, Page } from 'playwright';
import pino from 'pino';
import { ScrapedProductSchema, ScrapedProductSchemaType } from '../../types/scraperTypes';
import { scraperConfig } from '../../config/scraperConfig';
import { StoreAccessBlockedError } from '../../utils/scraperUtils';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:standard',
    },
  },
});

export abstract class BaseScraper {
  protected storeSlug: string;

  constructor(storeSlug: string) {
    this.storeSlug = storeSlug;
  }

  public getStoreSlug(): string {
    return this.storeSlug;
  }

  /**
   * Creates a standardized Playwright browser context using polite configuration.
   */
  protected async createContext(browser: Browser): Promise<BrowserContext> {
    const context = await browser.newContext({
      userAgent: scraperConfig.userAgent,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: 'Asia/Karachi',
    });
    return context;
  }

  /**
   * Checks if the page indicates an anti-bot challenge or access blockage.
   * If detected, throws StoreAccessBlockedError to trigger polite backoff.
   */
  protected async checkAntiBotBlock(page: Page, url: string): Promise<void> {
    try {
      const title = (await page.title()).toLowerCase();
      if (
        title.includes('attention required') ||
        title.includes('access denied') ||
        title.includes('just a moment...') ||
        title.includes('cloudflare') ||
        title.includes('security check')
      ) {
        logger.warn({ store: this.storeSlug, url, title }, 'Store anti-bot challenge or block detected via title');
        throw new StoreAccessBlockedError(`Store ${this.storeSlug} blocked access with challenge: "${title}"`);
      }

      const bodyText = (await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '')).toLowerCase();
      if (
        bodyText.includes('please verify you are a human') ||
        bodyText.includes('checking your browser') ||
        bodyText.includes('enable javascript and cookies to continue') ||
        bodyText.includes('ray id:') && bodyText.includes('cloudflare')
      ) {
        logger.warn({ store: this.storeSlug, url }, 'Store anti-bot challenge detected in page body');
        throw new StoreAccessBlockedError(`Store ${this.storeSlug} presented verification challenge`);
      }
    } catch (err) {
      if (err instanceof StoreAccessBlockedError) throw err;
      // non-blocking error during check
    }
  }

  /**
   * Execute the scraper logic to fetch products.
   * Scrapers should handle their own pagination and return an array of scraped products.
   */
  abstract scrape(): Promise<ScrapedProductSchemaType[]>;

  /**
   * Validates a scraped product against the strict Zod schema.
   */
  protected validateProduct(product: unknown): ScrapedProductSchemaType | null {
    try {
      const validProduct = ScrapedProductSchema.parse(product);
      return validProduct;
    } catch (error) {
      logger.error({ store: this.storeSlug, error }, 'Product validation failed');
      return null;
    }
  }
}

