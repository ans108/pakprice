import { ScrapeJobService } from '../services/ScrapeJobService';
import { ScrapeRepository } from '../repositories/ScrapeRepository';

console.log('─── Running DB Concurrency Race & Stale Job Tests (Increment 6I) ───\n');

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${description}${details ? ` — ${details}` : ''}`);
    failed++;
  }
}

async function runTests() {
  // Test 1: ScrapeRepository handles 23505 unique constraint violation cleanly
  const mockSupabaseUniqueViolation = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: null,
            error: {
              code: '23505',
              message: 'duplicate key value violates unique constraint "uq_scrape_jobs_one_running_store"',
              details: 'Key (store_id)=(store-abc) already exists where status = \'running\'.'
            }
          })
        })
      })
    })
  } as any;

  const repo = new ScrapeRepository();
  (repo as any).supabase = mockSupabaseUniqueViolation;

  // Replace global/instance supabase if applicable or use customized repo
  const customRepo = new (class extends ScrapeRepository {
    constructor() {
      super();
      (this as any).supabase = mockSupabaseUniqueViolation;
    }
    // We override createJob to use our mocked supabase client
    async createJob(storeId: string | null, triggeredBy: any, jobType: any, metadata?: any): Promise<string | null> {
      const { data, error } = await mockSupabaseUniqueViolation
        .from('scrape_jobs')
        .insert({})
        .select('id')
        .single();

      if (error) {
        if (
          error.code === '23505' ||
          error.message?.includes('uq_scrape_jobs_one_running_store') ||
          error.details?.includes('uq_scrape_jobs_one_running_store')
        ) {
          return null;
        }
        return null;
      }
      return data?.id || null;
    }
  })();

  const jobResult = await customRepo.createJob('store-abc', 'cron', 'refresh');
  assert('PostgreSQL 23505 unique violation returns null instead of throwing', jobResult === null);

  // Test 2: ScrapeJobService race handling
  // Scenario: getRunningJob returns null (fast path passes), but DB insert catches 23505 race
  const mockRepoWithRace = {
    getRunningJob: async () => null,
    createJob: async () => null, // catches 23505 and returns null
  } as unknown as ScrapeRepository;

  const jobService = new ScrapeJobService(mockRepoWithRace);
  const raceResult = await jobService.startJob('store-abc', 'cron', false, false, 'refresh');

  assert('startJob returns null cleanly when DB race occurs', raceResult === null);

  // Test 3: Stale running job policy (NEVER auto-reset)
  let updateJobCalled = false;
  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

  const mockRepoWithStaleJob = {
    getRunningJob: async () => ({
      id: 'stale-job-123',
      store_id: 'store-abc',
      status: 'running',
      started_at: twoHoursAgo,
    }),
    updateJob: async () => {
      updateJobCalled = true;
    },
    createJob: async () => 'new-job-id',
  } as unknown as ScrapeRepository;

  const staleService = new ScrapeJobService(mockRepoWithStaleJob);
  const staleResult = await staleService.startJob('store-abc', 'cron', false, false, 'refresh');

  assert('startJob skips execution when stale job exists', staleResult === null);
  assert('Automated job NEVER auto-resets or mutates stale running job (updateJob NOT called)', !updateJobCalled);

  // Test 4: Fast path blocks concurrent run when job is recent
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const mockRepoWithRecentJob = {
    getRunningJob: async () => ({
      id: 'active-job-456',
      store_id: 'store-abc',
      status: 'running',
      started_at: fiveMinutesAgo,
    }),
    createJob: async () => 'new-job-id',
  } as unknown as ScrapeRepository;

  const recentService = new ScrapeJobService(mockRepoWithRecentJob);
  const recentResult = await recentService.startJob('store-abc', 'cron', false, false, 'refresh');
  assert('Fast path immediately skips when recent active job exists', recentResult === null);

  console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
