import { ScraperService, StoreScrapeResult } from '../services/ScraperService';
import { scraperConfig } from '../config/scraperConfig';
import { logger } from '../scrapers/base/BaseScraper';

export async function runScraper(
  storeKey: string,
  triggeredBy: 'system' | 'admin' | 'cron' | 'manual' = 'manual',
  force: boolean = false,
  dryRun: boolean = scraperConfig.dryRun
): Promise<StoreScrapeResult | Record<string, StoreScrapeResult>> {
  const service = new ScraperService();

  if (storeKey === 'all') {
    logger.info({ triggeredBy, dryRun }, 'Starting scraper run for ALL supported stores');
    return await service.runAll(triggeredBy, dryRun);
  } else {
    logger.info({ storeKey, triggeredBy, force, dryRun }, 'Starting scraper run for store');
    return await service.runStore({ storeKey, triggeredBy, force, dryRun });
  }
}

// If run directly via CLI (e.g. tsx src/workers/scrapeWorker.ts priceoye --dry-run)
if (require.main === module) {
  let isShuttingDown = false;
  const handleSignal = (sig: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal: sig }, 'Scraper worker received termination signal; shutting down cleanly');
    setTimeout(() => {
      logger.fatal('Scraper shutdown timeout exceeded; exiting');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));

  const args = process.argv.slice(2);
  const store = args.find((a) => !a.startsWith('--')) || 'priceoye';
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run') || scraperConfig.dryRun;

  runScraper(store, 'manual', force, dryRun)
    .then((result) => {
      logger.info({ result }, 'Scraper worker process finished');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err: err.message }, 'Fatal error in scraper worker');
      process.exit(1);
    });
}

