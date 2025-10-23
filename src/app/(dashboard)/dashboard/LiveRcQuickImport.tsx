'use client';

import { useState } from 'react';

import styles from './LiveRcQuickImport.module.css';

type LiveRcDiscoveryEvent = {
  eventRef: string;
  title: string;
  whenIso?: string;
  score: number;
};

type DiscoverySuccessResponse = {
  data?: {
    events?: LiveRcDiscoveryEvent[];
  };
  error?: undefined;
};

type DiscoveryErrorResponse = {
  data?: undefined;
  error?: {
    message?: string;
  };
};

type DiscoveryResponse = DiscoverySuccessResponse | DiscoveryErrorResponse;

const DATE_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/;
const MAX_RANGE_DAYS = 7;

const parseDateInput = (value: string): { iso: string; date: Date } | null => {
  const trimmed = value.trim();
  const match = DATE_PATTERN.exec(trimmed);

  if (!match) {
    return null;
  }

  const [, dayRaw, monthRaw, yearRaw] = match;
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

const parseJsonSafely = async (response: Response): Promise<DiscoveryResponse | null> => {
  try {
    return (await response.json()) as DiscoveryResponse;
  } catch (error) {
    console.warn('Failed to parse LiveRC discovery response body.', error);
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

  return parsed.toLocaleString();
};

export default function LiveRcQuickImport(): JSX.Element {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [trackOrClub, setTrackOrClub] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<LiveRcDiscoveryEvent[] | null>(null);

  const parsedStart = parseDateInput(start);
  const parsedEnd = parseDateInput(end);
  const trimmedTrack = trackOrClub.trim();

  const hasValidDates = Boolean(
    parsedStart &&
      parsedEnd &&
      parsedEnd.date.getTime() >= parsedStart.date.getTime() &&
      daysBetweenInclusive(parsedStart.date, parsedEnd.date) <= MAX_RANGE_DAYS,
  );

  const canSubmit = hasValidDates && trimmedTrack.length >= 2;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit || submitting) {
      return;
    }

    const startDate = parseDateInput(start);
    const endDate = parseDateInput(end);

    if (!startDate || !endDate) {
      setError('Enter a valid date range using DD-MM-YYYY.');
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

    setSubmitting(true);
    setError(null);

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
        }),
      });

      const payload = await parseJsonSafely(response);

      if (!response.ok) {
        const message = payload?.error?.message ?? 'Unable to search LiveRC events right now.';
        setError(message);
        setEvents(null);
        return;
      }

      const discoveredEvents = payload?.data?.events;
      if (!Array.isArray(discoveredEvents)) {
        setError('Received an unexpected response from the LiveRC discovery API.');
        setEvents(null);
        return;
      }

      setEvents(discoveredEvents);
    } catch (requestError) {
      console.error('LiveRC discovery request failed.', requestError);
      setError('Something went wrong while searching LiveRC events. Please try again.');
      setEvents(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.quickImport} aria-labelledby="liverc-discovery-heading">
      <header className={styles.header}>
        <h2 className={styles.title} id="liverc-discovery-heading">
          LiveRC discovery
        </h2>
        <p className={styles.description}>
          Search LiveRC events by track or club. Enter a date range (up to seven days) to narrow the
          results.
        </p>
      </header>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.row}>
          <label htmlFor="start">Search start date</label>
          <input
            id="start"
            inputMode="numeric"
            pattern="\\d{2}-\\d{2}-\\d{4}"
            placeholder="DD-MM-YYYY"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </div>

        <div className={styles.row}>
          <label htmlFor="end">Search end date</label>
          <input
            id="end"
            inputMode="numeric"
            pattern="\\d{2}-\\d{2}-\\d{4}"
            placeholder="DD-MM-YYYY"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </div>

        <div className={styles.row}>
          <label htmlFor="track">Track or club name</label>
          <input
            id="track"
            type="text"
            placeholder="e.g., Canberra Off-Road, Keilor, Logan City"
            value={trackOrClub}
            onChange={(e) => setTrackOrClub(e.target.value)}
            required
          />
        </div>

        <div className={styles.actions}>
          <button type="submit" disabled={!canSubmit || submitting}>
            {submitting ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {events && (
        <div className={styles.results}>
          <h3>Matches</h3>
          {events.length === 0 ? (
            <p>No events found for that date range and track/club.</p>
          ) : (
            <ul className={styles.list}>
              {events.map((ev) => (
                <li key={ev.eventRef} className={styles.listItem}>
                  <div className={styles.eventTitle}>{ev.title}</div>
                  <div className={styles.eventWhen}>{formatEventWhen(ev.whenIso)}</div>
                  <a
                    className={styles.eventLink}
                    href={ev.eventRef}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on LiveRC
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
