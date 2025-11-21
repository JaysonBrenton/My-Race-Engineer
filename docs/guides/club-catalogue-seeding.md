<!--
 * Project: My Race Engineer
 * File: docs/guides/club-catalogue-seeding.md
 * Summary: Guide for seeding LiveRC club catalogue data in local environments.
 -->

# Club Catalogue Seeding

## What the Club model represents

The `Club` model maps to LiveRC clubs/tracks. Populating these rows powers the dashboard quick import so users can search for venues and bring over their events without typing URLs by hand.

## Ways to seed clubs for local development

### 1) Sync real clubs from LiveRC

- **Command:** `npm run liverc:sync-clubs`
- **What it does:** Fetches the root track list HTML from LiveRC, parses clubs, and upserts `Club` rows (including `isActive`, region, and country details).
- **Notes:** This command hits the real LiveRC site and depends on network access.

#### Limiting the number of clubs during sync

- By default the sync reconciles every club in the LiveRC directory and deactivates clubs missing from the latest scrape.
- Set `LIVERC_SYNC_CLUB_LIMIT` to a positive integer to cap how many clubs are upserted in a single run. When a limit is set, the sync skips deactivating missing clubs so you can run partial refreshes safely in development.
  - Unlimited (default): `npm run liverc:sync-clubs`
  - Limit to 50 clubs: `LIVERC_SYNC_CLUB_LIMIT=50 npm run liverc:sync-clubs`

### 2) Seed the curated catalogue

- **Command:** `npm run seed:liverc-catalogue`
- **What it does:** Seeds a small, stable set of Clubs + Events + RaceClasses + Sessions for repeatable tests and demos.

## When to use each option

- Use `liverc:sync-clubs` when you want a broader set of real clubs for discovery or search experiments.
- Use `seed:liverc-catalogue` when you want deterministic data for tests, screenshots, and demos.

## Safety notes

- Both scripts are intended for non-production environments.
- `prisma/schema.prisma` and the `DATABASE_URL` environment variable determine which database receives the seeded data. Double-check these before running either command.

## Troubleshooting

- **Empty database:** If `DATABASE_URL` points to a new database, run one of the seed/sync commands above to populate clubs and related catalogue data.
- **No clubs in the dashboard quick import:** Run `npm run liverc:sync-clubs` or `npm run seed:liverc-catalogue` and review the script logs for errors.
