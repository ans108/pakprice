-- =============================================================
-- PakPrice: Migration 009 — Scrape Jobs Job Type, Metadata & Concurrency (Increment 6I)
-- =============================================================

-- 1. Add job_type column to distinguish Discovery vs Refresh jobs
-- Backward-compatible: existing rows default to 'discovery'
ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL
    DEFAULT 'discovery'
    CHECK (job_type IN ('discovery', 'refresh'));

-- 2. Add metadata column for coverage metrics, low-coverage flags, and diagnostics
ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS metadata JSONB
    DEFAULT '{}'::jsonb;

-- 3. Indexes for operational queries filtering by store, status, and job type
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_store_job_type
  ON public.scrape_jobs(store_id, job_type);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status_job_type
  ON public.scrape_jobs(status, job_type);

-- 4. DB-atomic running-job concurrency protection:
-- Ensures at the database level that a store can have at most ONE running job at any time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scrape_jobs_one_running_store
  ON public.scrape_jobs (store_id)
  WHERE status = 'running';

-- 5. Force PostgREST schema cache reload so new columns are immediately queryable
NOTIFY pgrst, 'reload schema';
