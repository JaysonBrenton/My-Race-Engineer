<!--
/**
 * Project: My Race Engineer
 * File: docs/adr/ADR-20251119-liverc-club-based-discovery.md
 * Summary: Record the retirement of LiveRC discovery v1 and pivot to club-based event discovery.
 */
-->

# ADR-20251119: LiveRC club-based discovery

- Status: Accepted
- Date: 2025-11-19
- Authors: LiveRC Connector Working Group

## Context

The initial LiveRC discovery implementation assumed a global `https://live.liverc.com/events/?date=` page that accepted a date range and free-text track substring. That surface no longer exists, leaving the v1 discovery flow broken and misaligned with LiveRC’s current per-club site structure.

## Decision

Pivot discovery to a club-based model:

- Maintain a first-class `Club` catalogue sourced from the LiveRC root track list and expose it to the dashboard as a required selector.
- For discovery, fetch each club’s `/events/` page on its subdomain, parse the event listings, and filter locally by date range and optional limits.
- Update the dashboard quick import flow to rely on the club selector plus start/end dates; remove any free-text track inputs or references to the legacy global endpoint.
- Keep downstream import plan / apply / summary connectors intact so event ingestion contracts remain stable.

## Consequences

- Discovery is now accurate and compatible with LiveRC’s current per-club structure.
- A dedicated `Club` table and sync job back the selector and discovery inputs.
- Legacy discovery routes and tests tied to the global endpoint are replaced with club-based equivalents.
- Import plan, apply, and summary connectors remain stable and continue to operate on the discovered event references.
