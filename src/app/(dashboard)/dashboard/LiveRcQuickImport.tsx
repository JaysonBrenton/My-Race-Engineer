'use client';

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';

import styles from './LiveRcQuickImport.module.css';

type LiveRcDiscoveryEvent = {
  eventRef: string;
  title: string;
  whenIso?: string;
  score: number;
};

type LiveRcPlanItemStatus = 'NEW' | 'PARTIAL' | 'EXISTING';

type LiveRcPlanItem = {
  eventRef: string;
  status: LiveRcPlanItemStatus;
  counts: {
    sessions: number;
    drivers: number;
    estimatedLaps: number;
  };
};

type LiveRcPlan = {
  planId: string;
  generatedAt: string;
  items: LiveRcPlanItem[];
};

type DiscoverySuccessResponse = {
  data?: {
    events?: LiveRcDiscoveryEvent[];
  };
  requestId?: string;
  error?: undefined;
};

type DiscoveryErrorResponse = {
  data?: undefined;
  requestId?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

type DiscoveryResponse = DiscoverySuccessResponse | DiscoveryErrorResponse;

type PlanSuccessResponse = {
  data?: LiveRcPlan;
  requestId?: string;
  error?: undefined;
};

type PlanErrorResponse = {
  data?: undefined;
  requestId?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

type PlanResponse = PlanSuccessResponse | PlanErrorResponse;

type ApplySuccessResponse = {
  data?: {
    jobId: string;
  };
  requestId?: string;
  error?: undefined;
};

type ApplyErrorResponse = {
  data?: undefined;
  requestId?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

type ApplyResponse = ApplySuccessResponse | ApplyErrorResponse;

type DiscoveryEventWithSelection = LiveRcDiscoveryEvent & {
  selected: boolean;
  status?: LiveRcPlanItemStatus;
};

type DiscoveryState = {
  events: DiscoveryEventWithSelection[];
  filters: {
    start: string;
    end: string;
    track: string;
  };
};

const DATE_PATTERN_DD_MM_YYYY = /^(\d{2})-(\d{2})-(\d{4})$/;
const DATE_PATTERN_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_RANGE_DAYS = 7;
const DISCOVERY_LIMIT = 40;

const STATUS_LABELS: Record<LiveRcPlanItemStatus, string> = {
  NEW: 'New',
  PARTIAL: 'Partial import',
  EXISTING: 'Imported',
};

const STATUS_TITLES: Record<LiveRcPlanItemStatus, string> = {
  NEW: 'Not yet imported',
  PARTIAL: 'Partially imported – some data already exists',
  EXISTING: 'Already imported – excluded from new plans',
};

const parseDateInput = (value: string): { iso: string; date: Date } | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = DATE_PATTERN_ISO.exec(trimmed);
  if (isoMatch) {
    const [, yearRaw, monthRaw, dayRaw] = isoMatch;
    return parseDateComponents({ dayRaw, monthRaw, yearRaw });
  }

  const legacyMatch = DATE_PATTERN_DD_MM_YYYY.exec(trimmed);
  if (legacyMatch) {
    const [, dayRaw, monthRaw, yearRaw] = legacyMatch;
    return parseDateComponents({ dayRaw, monthRaw, yearRaw });
  }

  return null;
};

const parseDateComponents = ({
  dayRaw,
  monthRaw,
  yearRaw,
}: {
  dayRaw: string;
  monthRaw: string;
  yearRaw: string;
}): { iso: string; date: Date } | null => {
  const day = Number.parseInt(dayRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const year = Number.parseInt(yearRaw, 10);

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    date,
    iso: date.toISOString().slice(0, 10),
  };
};

const daysBetweenInclusive = (start: Date, end: Date): number => {
  const millisecondsPerDay = 86_400_000;
  return Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;
};

const parseJsonSafely = async <T,>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch (error) {
    console.warn('Failed to parse LiveRC response body.', error);
    return null;
  }
};

const formatEventWhen = (iso?: string): string => {
  if (!iso) {
    return '—';
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const computePlanTotals = (items: LiveRcPlanItem[]) => {
  let estimatedLaps = 0;
  for (const item of items) {
    estimatedLaps += Number.isFinite(item.counts.estimatedLaps) ? item.counts.estimatedLaps : 0;
  }

  return {
    eventCount: items.length,
    estimatedLaps,
  };
};

const formatNumber = (value: number): string => new Intl.NumberFormat('en-US').format(value);

export default function LiveRcQuickImport(): JSX.Element {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [trackOrClub, setTrackOrClub] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryState | null>(null);
  const [plan, setPlan] = useState<LiveRcPlan | null>(null);
  const [applyGuardrailError, setApplyGuardrailError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const parsedStart = useMemo(() => parseDateInput(start), [start]);
  const parsedEnd = useMemo(() => parseDateInput(end), [end]);
  const trimmedTrack = trackOrClub.trim();

  const hasValidDates = useMemo(() => {
    if (!parsedStart || !parsedEnd) {
      return false;
    }

    if (parsedEnd.date.getTime() < parsedStart.date.getTime()) {
      return false;
    }

    return daysBetweenInclusive(parsedStart.date, parsedEnd.date) <= MAX_RANGE_DAYS;
  }, [parsedStart, parsedEnd]);

  const canDiscover = hasValidDates && trimmedTrack.length >= 2 && !isDiscovering;
  const selectedEvents = discovery?.events.filter((event) => event.selected) ?? [];
  const canCreatePlan = selectedEvents.length > 0 && !isPlanning;
  const planTotals = plan ? computePlanTotals(plan.items) : null;
  const canApplyPlan = Boolean(
    plan && plan.items.length > 0 && !applyGuardrailError && !isApplying,
  );

  const resetPlanState = () => {
    setPlan(null);
    setApplyGuardrailError(null);
    setJobId(null);
  };

  const handleDiscover = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canDiscover) {
      setError('Enter a valid date range and track or club name.');
      return;
    }

    const startDate = parseDateInput(start);
    const endDate = parseDateInput(end);

    if (!startDate || !endDate) {
      setError('Select a valid date range.');
      return;
    }

    if (endDate.date.getTime() < startDate.date.getTime()) {
      setError('End date must be on or after the start date.');
      return;
    }

    if (daysBetweenInclusive(startDate.date, endDate.date) > MAX_RANGE_DAYS) {
      setError('Date range cannot be longer than 7 days.');
      return;
    }

    setIsDiscovering(true);
    setError(null);
    resetPlanState();

    try {
      const response = await fetch('/api/connectors/liverc/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          startDate: startDate.iso,
          endDate: endDate.iso,
          track: trimmedTrack,
          limit: DISCOVERY_LIMIT,
        }),
      });

      const payload = await parseJsonSafely<DiscoveryResponse>(response);

      if (!response.ok) {
        const message = payload?.error?.message ?? 'Unable to discover LiveRC events right now.';
        setError(message);
        setDiscovery(null);
        return;
      }

      const discoveredEvents = payload?.data?.events;
      if (!Array.isArray(discoveredEvents)) {
        setError('Received an unexpected response from the LiveRC discovery API.');
        setDiscovery(null);
        return;
      }

      const uniqueEvents = new Map<string, DiscoveryEventWithSelection>();
      for (const discovered of discoveredEvents) {
        if (!uniqueEvents.has(discovered.eventRef)) {
          uniqueEvents.set(discovered.eventRef, {
            ...discovered,
            selected: true,
          });
        }
      }

      setDiscovery({
        events: Array.from(uniqueEvents.values()),
        filters: {
          start: startDate.iso,
          end: endDate.iso,
          track: trimmedTrack,
        },
      });
    } catch (requestError) {
      console.error('LiveRC discovery request failed.', requestError);
      setError('Something went wrong while searching LiveRC events. Please try again.');
      setDiscovery(null);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleTrackChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTrackOrClub(event.target.value);
    resetPlanState();
  };

  const handleToggleSelection = (eventRef: string) => {
    setDiscovery((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        events: current.events.map((item) =>
          item.eventRef === eventRef ? { ...item, selected: !item.selected } : item,
        ),
      };
    });
    resetPlanState();
  };

  const handleCreatePlan = async () => {
    if (!discovery) {
      setError('Discover events before creating a plan.');
      return;
    }

    if (!canCreatePlan) {
      setError('Select at least one event to create a plan.');
      return;
    }

    setIsPlanning(true);
    setError(null);
    setApplyGuardrailError(null);
    setJobId(null);

    try {
      const response = await fetch('/api/connectors/liverc/import/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          events: selectedEvents.map((event) => ({ eventRef: event.eventRef })),
        }),
      });

      const payload = await parseJsonSafely<PlanResponse>(response);

      if (!response.ok) {
        const message =
          payload?.error?.message ?? 'Unable to create a LiveRC import plan right now.';
        setError(message);
        setPlan(null);
        return;
      }

      const planData = payload?.data;
      if (!planData || !Array.isArray(planData.items)) {
        setError('Received an unexpected response from the LiveRC import plan API.');
        setPlan(null);
        return;
      }

      const planItemsByRef = new Map<string, LiveRcPlanItem>();
      for (const item of planData.items) {
        planItemsByRef.set(item.eventRef, item);
      }

      setPlan(planData);
      setDiscovery((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          events: current.events.map((event) => {
            const planItem = planItemsByRef.get(event.eventRef);
            if (planItem) {
              return {
                ...event,
                selected: true,
                status: planItem.status,
              };
            }

            if (event.selected) {
              return {
                ...event,
                selected: false,
                status: 'EXISTING',
              };
            }

            return event;
          }),
        };
      });
    } catch (requestError) {
      console.error('LiveRC import plan request failed.', requestError);
      setError('Something went wrong while creating the LiveRC import plan. Please try again.');
      setPlan(null);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleApplyPlan = async () => {
    if (!plan) {
      setError('Create a plan before applying it.');
      return;
    }

    setIsApplying(true);
    setError(null);
    setApplyGuardrailError(null);

    try {
      const response = await fetch('/api/connectors/liverc/import/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ planId: plan.planId }),
      });

      const payload = await parseJsonSafely<ApplyResponse>(response);

      if (response.status === 400 && payload?.error?.code === 'PLAN_GUARDRAILS_EXCEEDED') {
        setApplyGuardrailError(
          payload.error.message ?? 'Selected LiveRC events exceed import guardrails.',
        );
        return;
      }

      if (!response.ok) {
        const message =
          payload?.error?.message ?? 'Unable to apply the LiveRC import plan right now.';
        setError(message);
        return;
      }

      const job = payload?.data;
      if (!job?.jobId) {
        setError('Received an unexpected response from the LiveRC import apply API.');
        return;
      }

      setJobId(job.jobId);
    } catch (requestError) {
      console.error('LiveRC import apply request failed.', requestError);
      setError('Something went wrong while applying the LiveRC import plan. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  const statusMessage = (() => {
    if (isDiscovering) {
      return 'Loading…';
    }

    if (isPlanning) {
      return 'Creating plan…';
    }

    if (isApplying) {
      return 'Applying plan…';
    }

    return null;
  })();

  return (
    <section className={styles.quickImport} aria-labelledby="liverc-discovery-heading">
      <header className={styles.header}>
        <h2 className={styles.title} id="liverc-discovery-heading">
          LiveRC quick import
        </h2>
        <p className={styles.description}>
          Search LiveRC events by track or club. Enter a date range (up to seven days) to narrow the
          results.
        </p>
      </header>

      <form className={styles.form} onSubmit={handleDiscover} noValidate>
        <div className={styles.row}>
          <label htmlFor="start">Search Start Date</label>
          <input
            id="start"
            type="date"
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              resetPlanState();
            }}
            required
          />
        </div>

        <div className={styles.row}>
          <label htmlFor="end">Search End Date</label>
          <input
            id="end"
            type="date"
            value={end}
            onChange={(event) => {
              setEnd(event.target.value);
              resetPlanState();
            }}
            required
          />
        </div>

        <div className={styles.row}>
          <label htmlFor="track">Track or club name</label>
          <input
            id="track"
            type="text"
            placeholder="e.g. Canberra, Keilor, Logan"
            value={trackOrClub}
            onChange={handleTrackChange}
            required
          />
        </div>

        <div className={styles.actions}>
          <button type="submit" disabled={!canDiscover}>
            {isDiscovering ? 'Discovering…' : 'Discover events'}
          </button>
        </div>
      </form>

      <div className={styles.statusArea} aria-live="polite">
        {statusMessage && <p className={styles.status}>{statusMessage}</p>}
        {error && (
          <p role="alert" className={styles.error}>
            Error: {error}
          </p>
        )}
      </div>

      {discovery && (
        <div className={styles.results}>
          <h3 className={styles.resultsHeading}>Results</h3>
          {discovery.events.length === 0 ? (
            <p className={styles.emptyState}>
              No events found for {discovery.filters.start}–{discovery.filters.end} at ‘
              {discovery.filters.track}’.
            </p>
          ) : (
            <>
              <div className={styles.resultsTableWrapper}>
                <table className={styles.resultsTable}>
                  <thead>
                    <tr>
                      <th scope="col">Select</th>
                      <th scope="col">Event Title</th>
                      <th scope="col">Date/Time (local)</th>
                      <th scope="col">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discovery.events.map((event) => (
                      <tr key={event.eventRef}>
                        <td>
                          <div className={styles.checkboxCell}>
                            <input
                              type="checkbox"
                              checked={event.selected}
                              onChange={() => handleToggleSelection(event.eventRef)}
                              aria-label={`Select ${event.title}`}
                            />
                          </div>
                        </td>
                        <td>
                          <div className={styles.eventTitleCell}>
                            <span className={styles.eventTitle}>{event.title}</span>
                            {event.status && (
                              <span
                                className={styles.statusBadge}
                                title={STATUS_TITLES[event.status]}
                                data-status={event.status.toLowerCase()}
                              >
                                {STATUS_LABELS[event.status]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={styles.eventWhen}>{formatEventWhen(event.whenIso)}</td>
                        <td>
                          <a
                            className={styles.eventLink}
                            href={event.eventRef}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View on LiveRC
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.resultActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleCreatePlan}
                  disabled={!canCreatePlan}
                >
                  {isPlanning ? 'Creating plan…' : 'Create plan'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {plan && (
        <div className={styles.planSummary} aria-live="polite">
          <h3 className={styles.planHeading}>Plan summary</h3>
          <dl className={styles.planDetails}>
            <div>
              <dt>Plan ID</dt>
              <dd className={styles.planValue}>{plan.planId}</dd>
            </div>
            <div>
              <dt>Selected event count</dt>
              <dd className={styles.planValue}>
                {planTotals ? formatNumber(planTotals.eventCount) : '0'}
              </dd>
            </div>
            <div>
              <dt>Estimated laps</dt>
              <dd className={styles.planValue}>
                {planTotals ? formatNumber(planTotals.estimatedLaps) : '0'}
              </dd>
            </div>
          </dl>

          {applyGuardrailError && (
            <p role="alert" className={styles.guardrailWarning}>
              {applyGuardrailError}
            </p>
          )}

          {jobId && (
            <p className={styles.successMessage}>
              Import job enqueued. Job ID: <span className={styles.jobId}>{jobId}</span>
            </p>
          )}

          <div className={styles.planActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleApplyPlan}
              disabled={!canApplyPlan}
            >
              {isApplying ? 'Applying plan…' : 'Apply plan'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
