import { BaseScraper } from './base/BaseScraper';
import { PriceOyeScraper } from './stores/PriceOyeScraper';
import { DarazScraper } from './stores/DarazScraper';
import { PaklapScraper } from './stores/PaklapScraper';
import { TelemartScraper } from './stores/TelemartScraper';
import { MegaPkScraper } from './stores/MegaPkScraper';
import { ShophiveScraper } from './stores/ShophiveScraper';
import { HomeShoppingScraper } from './stores/HomeShoppingScraper';
import { IShoppingScraper } from './stores/IShoppingScraper';
import { MetroScraper } from './stores/MetroScraper';
import { CarrefourScraper } from './stores/CarrefourScraper';
import { NaheedScraper } from './stores/NaheedScraper';
import { AlFatahScraper } from './stores/AlFatahScraper';

export class ScraperRegistry {
  private static instance: ScraperRegistry;
  private scrapers: Map<string, new () => BaseScraper> = new Map();

  private constructor() {
    this.register('priceoye', PriceOyeScraper);
    this.register('daraz', DarazScraper);
    this.register('paklap', PaklapScraper);
    this.register('telemart', TelemartScraper);
    this.register('mega-pk', MegaPkScraper);
    this.register('shophive', ShophiveScraper);
    this.register('homeshopping', HomeShoppingScraper);
    this.register('ishopping', IShoppingScraper);
    this.register('metro', MetroScraper);
    this.register('carrefour', CarrefourScraper);
    this.register('naheed', NaheedScraper);
    this.register('al-fatah', AlFatahScraper);
  }

  public static getInstance(): ScraperRegistry {
    if (!ScraperRegistry.instance) {
      ScraperRegistry.instance = new ScraperRegistry();
    }
    return ScraperRegistry.instance;
  }

  public register(storeSlug: string, scraperClass: new () => BaseScraper): void {
    this.scrapers.set(storeSlug.toLowerCase(), scraperClass);
  }

  public get(storeSlug: string): BaseScraper | null {
    const ScraperClass = this.scrapers.get(storeSlug.toLowerCase());
    if (!ScraperClass) return null;
    return new ScraperClass();
  }

  public has(storeSlug: string): boolean {
    return this.scrapers.has(storeSlug.toLowerCase());
  }

  public getSupportedStores(): string[] {
    return Array.from(this.scrapers.keys());
  }
}
