# TPTE MVP Product Guardrails

> Source: The Pace Tracing Engineer (TPTE) MVP brief.

These guardrails translate the MVP narrative into actionable scope boundaries for all contributors. Treat them as non-functional requirements: every story and technical task should trace back to one or more of these guardrails.

---

## Audience & value proposition
- **Primary users:** 1/8 and 1/10 off-road RC drivers competing at club and national level.
- **Secondary users:** race team managers, mechanics, and driver coaches who need quick insights.
- **Value promise:** turn raw race timing data into immediately actionable setup and driving decisions after every run.

Success is measured by the time it takes a driver to understand: *How fast am I? How consistent am I? Where did I lose time?*

---

## Core capabilities (must-haves)
1. **Authenticated dashboard landing**
   - Present recent events/sessions per driver after sign-in.
   - Surface headline metrics: best lap, median/average, standard deviation (consistency proxy), and clearly mark outliers.
   - Provide high-level charts summarising the most recent activity.
2. **LiveRC data ingestion (MVP scope)**
   - Connector must import by **event**, **session**, or **driver**.
   - Data is stored in a normalised internal format optimised for lap-wise comparisons and deltas.
   - Handle re-imports idempotently (no duplicate laps/sessions).
3. **Competitor comparisons**
   - Allow selection of any number of competitors from the same event/session so that a comparison can be made between the logged in driver and their competitors.
   - Visualise per-lap times and deltas relative to a chosen baseline (e.g., fastest driver, selected competitor, or self).
4. **Insightful visualisations**
   - Use tokenised chart components (ApexCharts or equivalent) that respect the design token system.
   - Highlight anomalies such as slow or missing laps. The definition of a slow lap is;

A slow lap is a lap whose time is meaningfully higher than the driver’s normal pace for that stint/session—i.e., an outlier versus their clean-lap baseline. Rule of thumb: flag it if the lap is >110–115% of median, > median + 2σ, or > +1.5–2.0 s (class-dependent). Common causes: bobble/crash and marshal pickup, traffic, bad landing over jumps, off-line mistakes, pit/stop-go, or short-term mechanical/tyre/battery issues.

   - Provide distribution/consistency indicators (e.g., box plots, histograms, sparklines).
5. **Filtering & focus tools**
   - Toggle visibility of outlaps/inlaps.
   - Isolate stints or subsets of laps to inspect pace shifts.
   - Surface “where time was lost” through clear summaries (e.g., segment breakdowns, delta tables).

All feature work in the MVP should be traceable to these five pillars.

---

## Non-goals (defer beyond MVP)
- Additional timing connectors (MyRCM, AMB/Mylaps, etc.).
- Real-time streaming telemetry or live timing overlays.
- Setup notebooks, pit strategy planners, or predictive analytics.
- Mobile-native apps; responsive web is sufficient for MVP.
- Team collaboration primitives beyond comparing multiple drivers.

If any task drifts into these areas, capture it in the backlog rather than expanding scope.

---

## Experience guardrails
- **Accessibility:** Charts and tables must provide text equivalents, keyboard navigation, and colour-agnostic encodings.
- **Performance:** Respect documented budgets — dashboards should stay responsive (<800 ms P95 for key interactions).
- **Consistency:** Reuse design tokens, typography, and spacing; avoid inline hex values or ad-hoc chart palettes.
- **Narrative:** Every view should answer the core driver questions (“pace”, “consistency”, “delta to competitors”) without requiring expert interpretation.

---

## Data quality & integrity
- Validate imported data (lap counts, timestamps, penalties) before persistence.
- Tag laps with metadata (outlap/inlap, penalty reason) to support filtering.
- Ensure that the storage model supports fast comparisons across multiple drivers within the same event/session.
- Maintain auditability: store source identifiers (event, session, driver IDs) and import timestamps.

---

## Telemetry & insights instrumentation
- Emit structured analytics events when users:
  - Import data (success/failure, source identifiers).
  - Create or modify comparison sets.
  - Apply filters that materially change insights (e.g., hide outlaps).
- Capture anonymised usage metrics that help prioritise future connectors or analysis views.

---

## Implementation notes
- Keep ingestion logic within `src/core/app` services backed by infra adapters for LiveRC.
- Derive visual analytics in the domain layer where feasible, so UI components render pre-computed insights.
- Ensure test coverage for the parsing/normalisation pipeline (fixtures per event/session variation).

---

## Rollout checklist for MVP completion
- [ ] Authentication + dashboard experience available behind feature flag or guarded route.
- [ ] LiveRC connector deployed with monitoring and retry/backoff strategy.
- [ ] Comparison views validated with at least two competitor datasets.
- [ ] Charts reviewed for accessibility (contrast, labels, screen-reader support).
- [ ] Operational endpoints (`/api/health`, `/api/ready`, `/api/version`) wired into deployment pipeline.

Maintain this checklist in the PR description when closing MVP epics.

---

## Change management
- Update this document whenever the product scope changes.
- Cross-link relevant ADRs and implementation guides as they are authored.
- Mention scope/guardrail changes in the release notes so teams downstream stay aligned.

