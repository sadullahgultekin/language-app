# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start local dev server (wrangler dev)
npm run deploy           # Deploy to Cloudflare production
npm run db:migrate:local  # Apply migrations to local D1 (SQLite)
npm run db:migrate:remote # Apply migrations to remote D1
```

No lint or test commands are configured.

## Architecture

**Stack:** Cloudflare Workers + Hono (backend) · Vanilla JS SPA (frontend) · Cloudflare D1/SQLite (database)

**Request flow:**
1. Static assets in `/public` are served directly by the Worker
2. The SPA uses hash-based routing (`#/lists/1`, `#/study`)
3. Frontend calls `/api/*` endpoints via `public/js/api.js`
4. Hono routes in `src/index.ts` delegate to three API modules: `lists`, `words`, `study`
5. All SQL goes through the data access layer in `src/db/queries.ts`
6. The D1 database is injected as `c.env.DB` (binding name `DB`, defined in `wrangler.toml`)

**Key files:**
- `src/index.ts` — Hono app entry, mounts the three API routers
- `src/db/queries.ts` — All SQL queries; the only place that talks to D1
- `src/types.ts` — Env binding type + shared domain interfaces (List, Word, StudyWord, etc.)
- `src/api/study.ts` — Study deck fetch and result recording endpoints
- `public/js/app.js` — Client-side hash router
- `public/js/views/study.js` — Flashcard UI and session state
- `public/sw.js` — Service worker (app-shell cache; API calls are network-only)
- `migrations/0001_init.sql` — Schema: `lists`, `words`, `study_progress`

## Spaced Repetition System

The learning algorithm lives entirely in `src/db/queries.ts`:

- Each word has a `confidence` score (0–5) stored in `study_progress`
- Confidence maps to a fixed review interval: 0→0h, 1→4h, 2→1d, 3→3d, 4→7d, 5→14d
- Correct answer: `confidence = min(5, confidence + 1)`; incorrect: `confidence = max(0, confidence - 1)`
- `getStudyDeck` selects up to 30 words in three priority tiers: never-seen → overdue (most overdue first) → not-yet-due (random)
- Not-yet-due words are included as filler, so confidence can be gamed in a single session — a known limitation

## Database / Migrations

New migrations go in `/migrations/` as sequentially named SQL files. Apply locally before remote. There is no migration framework — files are executed manually via `wrangler d1 execute`.

## Frontend Notes

- No build step — raw ES6 modules loaded directly by the browser
- PWA-ready with `manifest.json` and service worker
- `public/js/api.js` is the single fetch wrapper; all views import from it

## PWA Cache Busting

Cloudflare deploys directly from git with no build step. A pre-commit hook (`.git/hooks/pre-commit`) automatically updates the cache name in `public/sw.js` with the current commit hash on every commit — no manual step needed.
