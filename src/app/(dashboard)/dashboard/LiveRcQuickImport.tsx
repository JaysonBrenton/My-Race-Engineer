'use client';

import { useMemo, useState, type FormEvent } from 'react';
import styles from './LiveRcQuickImport.module.css';

type DiscoveryEvent = {
  eventRef: string;
  title: string;
  whenIso?: string;
  score: number;
};

type DiscoveryResponse =
  | { data: { events: DiscoveryEvent[] }; requestId: string }
  | { error: { code: string; message: string; details?: unknown }; requestId?: string };

function normaliseDateInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const dmyMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);

  let yyyy: number;
  let mm: number;
  let dd: number;

  if (isoMatch) {
    yyyy = Number(isoMatch[1]);
    mm = Number(isoMatch[2]);
    dd = Number(isoMatch[3]);
  } else if (dmyMatch) {
    dd = Number(dmyMatch[1]);
    mm = Number(dmyMatch[2]);
    yyyy = Number(dmyMatch[3]);
  } else {
    return null;
  }

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const iso = `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const roundTrip = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return roundTrip === iso ? iso : null;
}

function daysInclusive(aIso: string, bIso: string): number | null {
  const a = new Date(aIso + 'T00:00:00Z');
  const b = new Date(bIso + 'T00:00:00Z');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
}

export default function LiveRcQuickImport() {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [trackOrClub, setTrackOrClub] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<DiscoveryEvent[] | null>(null);

  const canSubmit = useMemo(() => {
    const trimmedTrack = trackOrClub.trim();
    if (!start || !end || !trimmedTrack) return false;
    const startIso = normaliseDateInput(start);
    const endIso = normaliseDateInput(end);
    if (!startIso || !endIso) return false;
    const days = daysInclusive(startIso, endIso);
    return !!days && days > 0 && days <= 7;
  }, [start, end, trackOrClub]);

  const toStateDateValue = (value: string): string => {
    if (!value) return '';
    const normalised = normaliseDateInput(value);
    return normalised ?? value;
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEvents(null);

    const startIso = normaliseDateInput(start);
    const endIso = normaliseDateInput(end);
    const trimmedTrack = trackOrClub.trim();
    if (!startIso || !endIso) {
      setError('Dates must be valid calendar days.');
      return;
    }
    const days = daysInclusive(startIso, endIso);
    if (!days || days < 1 || days > 7) {
      setError('Date range must be between 1 and 7 days (inclusive).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/connectors/liverc/discover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startDate: startIso,
          endDate: endIso,
          track: trimmedTrack, // label is “Track or club name”; API key remains `track`
        }),
      });
      const json = (await res.json()) as DiscoveryResponse;
      if (!res.ok || 'error' in json) {
        const msg = 'error' in json ? json.error.message : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setEvents(json.data.events);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Discovery failed.');
      } else {
        setError('Discovery failed.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.quickImport} aria-labelledby="quick-import-heading">
      <header className={styles.header}>
        <h2 id="quick-import-heading" className={styles.title}>
          LiveRC quick import
        </h2>
        <p className={styles.description}>
          Search by date range and track/club, then pick events to import.
        </p>
      </header>

      <form onSubmit={onSubmit} className={styles.form}>
        <div className={styles.row}>
          <label htmlFor="start">Search start date</label>
          <input
            id="start"
            type="date"
            value={start}
            max={end || undefined}
            onChange={(e) => setStart(toStateDateValue(e.target.value))}
            required
          />
        </div>
        <div className={styles.row}>
          <label htmlFor="end">Search end date</label>
          <input
            id="end"
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(toStateDateValue(e.target.value))}
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
                  <div className={styles.eventWhen}>
                    {ev.whenIso ? new Date(ev.whenIso).toLocaleString() : '—'}
                  </div>
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
