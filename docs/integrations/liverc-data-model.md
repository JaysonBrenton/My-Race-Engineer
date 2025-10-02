# LiveRC → My Race Engineer (MRE) Data Contract

This note captures the mapping between LiveRC timing endpoints and the My Race Engineer (MRE)
Prisma/domain schema. Use it as the contract for every ingestion change so that
new adapters and tests stay aligned.

## Reference schema

| Layer | Shape |
| --- | --- |
| Prisma | `Lap { id: String @id, entrantId: String, sessionId: String, lapNumber: Int, lapTimeMs: Int, createdAt: DateTime, updatedAt: DateTime, @@unique([entrantId, lapNumber]) }` |
| Domain | `Lap { id: string; entrantId: string; sessionId: string; lapNumber: number; lapTime: { milliseconds: number }; createdAt: Date; updatedAt: Date; }` |

> **Identifiers**
> - The canonical lap identifier is `sha256(eventId + sessionId + raceId +
>   driverId + lapNumber)` stored in Prisma `Lap.id`.
> - Driver metadata (`displayName`, car number, transponder) is normalised and
>   persisted on the associated `Entrant` record. Each lap references that
>   entrant via `entrantId`.
> - `lapNumber` is 1-based as delivered by LiveRC.
> - `lapTimeMs` is the lap duration converted into milliseconds (rounded to the
>   nearest whole number).

All ingestion pipelines must convert upstream payloads into the above shapes.
Timestamps `createdAt` and `updatedAt` are set by Prisma; do not try to mirror
remote timestamps.

## Endpoint overview

| Endpoint | LiveRC route | Purpose |
| --- | --- | --- |
| Entry list | `/results/{eventSlug}/{classSlug}/entry-list.json` | Discover drivers, car numbers, and membership in a class. |
| Heat sheet | `/results/{eventSlug}/{classSlug}/{roundSlug}/heats.json` | Enumerate heats and race IDs within a round. |
| Round ranking | `/results/{eventSlug}/{classSlug}/{roundSlug}/ranking.json` | Determine advancing drivers and seeding. |
| Multi-main | `/results/{eventSlug}/{classSlug}/multi-main.json` | Resolve combined main events (A/B/C) into a single order. |
| Race result | `/results/{eventSlug}/{classSlug}/{roundSlug}/{raceSlug}.json` | Fetch lap-by-lap timing, penalties, and metadata per race. |

### Entry list

**Purpose:** establish the roster and canonical driver identifiers for a class.

**Key fields and mapping**

| LiveRC field | Example | Mapping |
| --- | --- | --- |
| `entry_id` | `"1738295"` | Stable identifier used in hash key. Store as `driverId`. |
| `display_name` | `"Ryan Maifield"` | Normalised and persisted as `Entrant.displayName`. |
| `car_number` | `"5"` | Stored in ingestion metadata only; not part of `Lap`. |
| `class_id` | `"45932"` | Used to scope downstream requests; stored in ingestion cache. |

**Filtering rules**

- Drop entries without an `entry_id` (cannot dedupe laps).
- Ignore entries flagged `withdrawn: true`.
- When URLs point to a driver-specific page, filter the entry list to that
  driver ID before scheduling race downloads.

### Heat sheet

**Purpose:** map rounds to race (heat/main) identifiers per class.

**Key fields and mapping**

| LiveRC field | Mapping |
| --- | --- |
| `heat_id` | Treated as `raceId` component for later hashes. |
| `round_id` | Combined with class/event to request ranking + race result files. |
| `session_type` | Used to filter to heats vs mains. `"Qual"` and `"Main"` are kept; `"Practice"` is skipped. |
| `group_name` | Persisted in ingestion metadata for UI labels. |

**Filtering rules**

- Only schedule heats whose `session_type` matches the session or class slug in
  the supplied URL (e.g., ignore Truck heats when the URL targets Buggy).
- When a session URL is supplied, include only heats whose `round_id` equals the
  targeted round.

### Round ranking

**Purpose:** identify which drivers advance and canonicalise driver ordering.

**Key fields and mapping**

| LiveRC field | Mapping |
| --- | --- |
| `entry_id` | Join back to entry list for canonical driver data. |
| `rank` | Stored in ingestion metadata for seeding; not persisted to Prisma. |
| `round_points` | Used to determine drop races; influences session selection but not persisted. |

**Filtering rules**

- Discard rankings whose `status` is not `"complete"`.
- When the ingestion is driver-scoped, keep only rows matching the target
  `entry_id`.

### Multi-main

**Purpose:** flatten multiple mains for the same class into a composite result.

**Key fields and mapping**

| LiveRC field | Mapping |
| --- | --- |
| `main_id` | Appended to `raceId` when hashing lap IDs to disambiguate mains. |
| `entry_id` | Joins to driver metadata. |
| `position_overall` | Stored for downstream analytics; not persisted in Prisma. |

**Filtering rules**

- Keep only mains flagged `status: "complete"`.
- Respect the selected main letter from the URL (e.g., `/amain/` only pulls
  `main_id` values whose `letter` is `"A"`).

### Race result

**Purpose:** source of lap-by-lap timing that feeds the `Lap` table.

**Key fields and mapping**

| LiveRC field | Example | Mapping |
| --- | --- | --- |
| `race_id` | `"793015"` | Combined with other IDs to hash `Lap.id`. |
| `entry_id` | `"1738295"` | Driver identifier (from entry list). |
| `driver_name` | `"Ryan Maifield"` | Normalised → `Entrant.displayName` (and referenced by `Lap.entrantId`). |
| `laps` | Array of lap objects | Each lap transformed to Prisma `Lap`. |
| `laps[].lap` | `1` | → `lapNumber`. |
| `laps[].lap_time` | `32.745` seconds | Multiply by `1000` → `lapTimeMs`. |
| `laps[].is_outlap` | `true`/`false` | Captured in metadata; not persisted yet but used for filtering. |
| `laps[].penalties` | Array | Used to tag laps in metadata; does not change `lapTimeMs` directly. |

**Transformation sequence**

1. Normalise driver metadata using the entry list join.
2. Sort laps by `lap` ascending.
3. Convert `lap_time` seconds → integer milliseconds (`Math.round(seconds * 1000)`).
4. Generate deterministic `Lap.id` hash from `eventId`, `classId`, `raceId`,
   `entryId`, and `lapNumber`.
5. Upsert into Prisma using the `(entrantId, lapNumber)` unique constraint to
   deduplicate re-ingests.

**Filtering rules**

- Skip laps where `lap_time` is `0` or `null` (incomplete timing pass).
- Exclude laps flagged `is_outlap` when downstream consumers request *race-only*
  segments; keep them otherwise for auditing.
- When ingestion is scoped by driver, fetch only the race result blocks for the
  target `entry_id`.
- `startTimeUtc` values **must** include an explicit UTC offset (e.g., trailing
  `Z` or `+/-HH:MM`). Strings without a timezone are treated as `null` when we
  persist `Session.scheduledStart` to avoid offset drift across environments.

## Derived metadata

While only lap rows are persisted today, the ingestion pipeline must surface the
following metadata for higher layers:

- `eventId`, `eventName`, `classId`, `className`, `sessionId`, `sessionType`,
  `roundId`, `roundName`, `raceId`, `raceName` — required for session selection
  and UI breadcrumbs.
- `totalTimeMs`, `fastLapMs`, `averageLapMs`, `penalties[]`, `outlapCount`,
  `pitCount` — cached in-memory for chart preparation.
- `source` envelope with timestamp, endpoint URL, HTTP status, and checksum to
  support audit trails.

All metadata should travel through the app-layer ingestion service but remain
outside the Prisma schema until we widen storage.

## Contract tests

- Fixture-based contract tests must assert that the same LiveRC payload hashed
  twice produces identical `Lap.id` values.
- Race results without a matching entry list row must be rejected (avoid orphan
  laps).
- Duplicate laps (same driver + lap number) must update the existing row rather
  than insert a second copy.

Any future schema changes must update this document, regenerate fixtures, and
communicate the new rules to downstream teams.
