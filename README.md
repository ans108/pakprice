# PakPrice

Pakistan's smart product price comparison platform.

Compare prices across Daraz, PriceOye, Telemart, Shophive, and 9+ more Pakistani stores — all in one place.

---

## Project Structure

```
pakprice/
├── apps/
│   ├── web/          # Next.js 15 frontend (App Router + TypeScript)
│   ├── api/          # Express 4 + TypeScript backend
│   └── scraper/      # Phase 3 placeholder (not implemented)
│
├── packages/
│   └── shared/       # Shared TypeScript types (used by web + api)
│
├── database/
│   └── migrations/   # Supabase PostgreSQL migration SQL files
│
├── package.json      # npm workspace root
└── README.md
```

---

## Tech Stack

| Layer     | Technology                                   |
|-----------|----------------------------------------------|
| Frontend  | Next.js 15, React 19, TypeScript, Tailwind CSS |
| UI        | shadcn/ui (minimal: Button, Input, Badge)    |
| Backend   | Express 4, TypeScript, Pino, Zod             |
| Database  | Supabase (PostgreSQL)                        |
| Auth      | Supabase Auth (Phase 2)                      |
| HTTP      | Axios (frontend → API)                       |
| Monorepo  | npm workspaces                               |

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- A [Supabase](https://supabase.com) project (free tier is fine)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

**API:**
```bash
cp apps/api/.env.example apps/api/.env
# Fill in your Supabase URL, anon key, and service-role key
```

**Web:**
```bash
cp apps/web/.env.example apps/web/.env.local
# Fill in your Supabase URL, anon key, and API URL
```

> ⚠️ **Security**: `SUPABASE_SERVICE_ROLE_KEY` must only be in `apps/api/.env`.  
> Never add it to `apps/web/.env.local` or any frontend file.

### 3. Run database migrations

In your Supabase project, go to **SQL Editor** and run these files in order:

1. `database/migrations/001_initial_schema.sql`
2. `database/migrations/002_rls_policies.sql`
3. `database/migrations/003_seed_stores.sql`

### 4. Start the API

```bash
npm run dev:api
# API runs on http://localhost:4000
```

### 5. Start the frontend

```bash
npm run dev:web
# Frontend runs on http://localhost:3000
```

---

## API Endpoints (Phase 1)

| Method | Endpoint            | Description                        |
|--------|---------------------|------------------------------------|
| GET    | `/`                 | Root — service alive check         |
| GET    | `/health`           | Detailed health + DB config status |
| GET    | `/api/v1/health`    | API v1 health check                |
| GET    | `/api/v1/stores`    | List all active stores             |

---

## Database Schema

See `database/migrations/001_initial_schema.sql` for the full schema.

Key design decisions:

- **products** = model/family level (e.g. "Samsung Galaxy A56")
- **product_variants** = exact purchasable configuration:
  - `ram_gb` + `storage_gb` + `color` + `model_number`
  - Each combination is a unique row — duplicates are prevented by a `UNIQUE NULLS NOT DISTINCT` constraint
- **image_url columns**: must be absolute `https://` URLs or `NULL`. Frontend falls back: variant image → product image → placeholder
- **store_product_identifiers**: maps a variant to a store-specific SKU/URL for Phase 3 scraping
- **RLS**: user-owned tables (favorites, alerts, history) are protected per-user; public product/store data is readable by anyone

---

## Phase Roadmap

| Phase | Status      | Scope                                              |
|-------|-------------|----------------------------------------------------|
| 1     | ✅ Complete  | Foundation: schema, API, landing page              |
| 2     | 🔜 Planned   | Auth, user profiles, favorites, product pages      |
| 3     | 🔜 Planned   | Scraper, price comparison, search, price alerts    |

---

## Scripts

```bash
npm run dev:web       # Start Next.js dev server
npm run dev:api       # Start API dev server (tsx watch)
npm run build:web     # Production build of the frontend
npm run build:api     # TypeScript compile the API
npm run typecheck     # TypeScript check all workspaces
npm run lint          # ESLint all workspaces
npm run format        # Prettier format
```

---

## Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` is **server-side only** — never exposed to the browser
- Frontend uses only `NEXT_PUBLIC_SUPABASE_ANON_KEY` (subject to RLS)
- All user tables have RLS enabled — users can only read/write their own rows
- API uses rate limiting and CORS origin allowlist

---

## License

MIT
