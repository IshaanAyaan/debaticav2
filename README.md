# Debatica

Debatica is a focused debate evidence finder built with Next.js. It serves a simple two-pane search experience: results on the left, a rendered debate card on the right, with copy-ready formatting and source links for each card.


## What It Does

- Searches clustered debate evidence across Policy, LD, PF, and BQ
- Returns exact matches first, then closest matches when a query is weak
- Renders evidence in a card-style reading pane with highlighted markup when available
- Lets users copy a formatted card instantly
- Preserves source article, source page, and file links when they exist
- Supports alternate cuts inside the same evidence cluster

## Stack

- Next.js 14
- React 18
- Tailwind CSS
- SQLite via `node:sqlite`
- Optional Supabase sync/search plumbing for future hosted expansion

## Project Layout

```text
app/                    Next.js app routes and API routes
components/             UI components, including the evidence finder page
data/                   Bundled demo SQLite index
fixtures/               Sample CSV used to build the demo corpus
lib/evidence/           Search, ingest, SQLite, text, and provider logic
lib/supabase/           Hosted schema and sync support
scripts/                Offline ingest and sync scripts
tests/                  Search and runtime regression tests
```

## Getting Started

Install dependencies:

```bash
npm install
```

Build the demo evidence index:

```bash
npm run ingest:evidence:demo
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Useful Scripts

```bash
npm run dev
npm run build
npm start
npm test
npm run ingest:evidence:demo
npm run ingest:evidence
npm run sync:evidence:supabase
```

## Search Architecture

The app uses clustered evidence records instead of raw rows. Each cluster represents a canonical card plus supporting variants.

- `GET /api/search/cards` returns result summaries
- `GET /api/cards/:id` returns full card detail
- `GET /api/cards/:id/variants` returns alternate cuts from the same cluster
- `GET /api/search/meta` returns corpus metadata and readiness state

Weak searches are intentionally non-fatal. If an exact query path underperforms, Debatica falls back to closest-match and browse-style results instead of returning an empty failure state.

## Deployment Notes

The default production mode uses the committed `data/evidence-index.sqlite` file.

- local development opens the bundled database directly
- Vercel copies the bundled database into a writable `/tmp` runtime path before querying it
- `package.json` pins Node `22.x` to keep `node:sqlite` behavior stable in production

If you expand beyond the bundled SQLite demo index, the Supabase sync path in `scripts/sync-evidence-to-supabase.ts` and `lib/supabase/schema.sql` is the intended next step.

## Current Focus

This repository is intentionally narrow. It is not the older multi-feature Debatica concept. The codebase now centers on one job only: make debate evidence easy to search, read, and copy.
