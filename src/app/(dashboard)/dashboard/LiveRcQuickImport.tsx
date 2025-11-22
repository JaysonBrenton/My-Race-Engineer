/**
 * Project: My Race Engineer
 * File: src/app/(dashboard)/dashboard/LiveRcQuickImport.tsx
 * Summary: Dashboard widget for discovering LiveRC events by club and date range with inline suggestions.
 */
'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import styles from './LiveRcQuickImport.module.css';

type DiscoveryEvent = {
  eventRef: string;
  title: string;
  whenIso?: string;
  score: number;
};

type ClubSuggestion = {
  id: string;
  name: string;
  location?: string | null;
  subdomain?: string | null;
};

type EventSuggestion = {
  eventRef: string;
  title: string;
  whenIso: string;
  clubId: string;
  clubSubdomain: string;
};

type DiscoveryResponse =
  | { data: { events: DiscoveryEvent[] }; requestId: string }
  | { error: { code: string; message: string; details?: unknown }; requestId?: string };

type ClubSearchResponse =
  | { data: { clubs: ClubSuggestion[] }; requestId: string }
  | { error: { code: string; message: string; details?: unknown }; requestId?: string };

type EventSearchResponse =
  | { data: { events: EventSuggestion[] }; requestId: string }
  | { error: { code: string; message: string; details?: unknown }; requestId?: string };

const CLUB_SEARCH_LIMIT = 10;
const EVENT_SEARCH_LIMIT = 10;
const DISCOVERY_LIMIT = 25;
const CLUB_SEARCH_TOOLTIP = 'Type at least 2 characters to search.';
const EVENT_SEARCH_TOOLTIP = 'Type at least 2 characters to search for events.';

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

function isWithinSixMonths(startIso: string, endIso: string): boolean {
  const startDate = new Date(startIso + 'T00:00:00Z');
  const endDate = new Date(endIso + 'T00:00:00Z');
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return false;
  if (endDate < startDate) return false;

  const limit = new Date(startDate);
  limit.setUTCMonth(limit.getUTCMonth() + 6);

  return endDate <= limit;
}

/**
 * Renders the LiveRC quick import form with club search, date validation, and inline discovery results.
 */
export default function LiveRcQuickImport() {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [clubQuery, setClubQuery] = useState('');
  const [clubSuggestions, setClubSuggestions] = useState<ClubSuggestion[]>([]);
  const [selectedClub, setSelectedClub] = useState<ClubSuggestion | null>(null);
  const [clubSearchError, setClubSearchError] = useState<string | null>(null);
  const [clubSearchLoading, setClubSearchLoading] = useState(false);

  const [eventQuery, setEventQuery] = useState('');
  const [eventSuggestions, setEventSuggestions] = useState<EventSuggestion[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventSuggestion | null>(null);
  const [eventSearchError, setEventSearchError] = useState<string | null>(null);
  const [eventSearchLoading, setEventSearchLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<DiscoveryEvent[] | null>(null);

  const trimmedClubQuery = clubQuery.trim();
  const trimmedEventQuery = eventQuery.trim();

  const canSubmit = useMemo(() => {
    if (!start || !end || !selectedClub) return false;
    const startIso = normaliseDateInput(start);
    const endIso = normaliseDateInput(end);
    if (!startIso || !endIso) return false;
    const days = daysInclusive(startIso, endIso);
    return !!days && days > 0 && days <= 7 && isWithinSixMonths(startIso, endIso);
  }, [start, end, selectedClub]);

  const toStateDateValue = (value: string): string => {
    if (!value) return '';
    const normalised = normaliseDateInput(value);
    return normalised ?? value;
  };

  /**
   * Clears the currently selected club and any dependent autocomplete state so users can restart their search.
   */
  const clearSelectedClub = () => {
    setSelectedClub(null);
    setClubQuery('');
    setClubSuggestions([]);
    setClubSearchError(null);
    setClubSearchLoading(false);
    // Clear event search when club is cleared
    clearSelectedEvent();
  };

  /**
   * Clears the currently selected event and any dependent autocomplete state.
   */
  const clearSelectedEvent = () => {
    setSelectedEvent(null);
    setEventQuery('');
    setEventSuggestions([]);
    setEventSearchError(null);
    setEventSearchLoading(false);
  };

  useEffect(() => {
    const trimmedQuery = clubQuery.trim();
    setClubSearchError(null);

    // Clear suggestions and selection when the query is emptied.
    if (trimmedQuery.length === 0) {
      setSelectedClub(null);
      setClubSuggestions([]);
      setClubSearchLoading(false);
      return;
    }

    if (selectedClub && selectedClub.name === trimmedQuery) {
      // Preserve the current selection without re-querying when the input matches the chosen club.
      setClubSuggestions([]);
      setClubSearchLoading(false);
      return;
    }

    if (trimmedQuery.length < 2) {
      setClubSuggestions([]);
      setSelectedClub(null);
      setClubSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const runSearch = async () => {
      setClubSearchLoading(true);
      try {
        const res = await fetch(
          `/api/connectors/liverc/clubs/search?q=${encodeURIComponent(trimmedQuery)}&limit=${CLUB_SEARCH_LIMIT}`,
          { signal: controller.signal },
        );
        const json = (await res.json()) as ClubSearchResponse;
        if (!res.ok || 'error' in json) {
          const message = 'error' in json ? json.error.message : `HTTP ${res.status}`;
          throw new Error(message);
        }
        setClubSuggestions(json.data.clubs);
      } catch (err) {
        if (controller.signal.aborted) return;
        setClubSuggestions([]);
        setClubSearchError(err instanceof Error ? err.message : 'Club search failed.');
      } finally {
        if (!controller.signal.aborted) {
          setClubSearchLoading(false);
        }
      }
    };

    void runSearch();

    return () => {
      controller.abort();
    };
  }, [clubQuery, selectedClub]);

  // Event search effect - triggers when event query changes and a club is selected
  useEffect(() => {
    const trimmedQuery = eventQuery.trim();
    setEventSearchError(null);

    // Only search if a club is selected
    if (!selectedClub) {
      clearSelectedEvent();
      return;
    }

    // Clear suggestions and selection when the query is emptied.
    if (trimmedQuery.length === 0) {
      setSelectedEvent(null);
      setEventSuggestions([]);
      setEventSearchLoading(false);
      return;
    }

    if (selectedEvent && selectedEvent.title === trimmedQuery) {
      // Preserve the current selection without re-querying when the input matches the chosen event.
      setEventSuggestions([]);
      setEventSearchLoading(false);
      return;
    }

    if (trimmedQuery.length < 2) {
      setEventSuggestions([]);
      setSelectedEvent(null);
      setEventSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const runSearch = async () => {
      setEventSearchLoading(true);
      try {
        const startIso = normaliseDateInput(start);
        const endIso = normaliseDateInput(end);
        const params = new URLSearchParams({
          clubId: selectedClub.id,
          q: trimmedQuery,
          limit: String(EVENT_SEARCH_LIMIT),
        });
        // Include date range if provided
        if (startIso && endIso) {
          params.append('startDate', startIso);
          params.append('endDate', endIso);
        }

        const res = await fetch(
          `/api/connectors/liverc/events/search?${params.toString()}`,
          { signal: controller.signal },
        );
        const json = (await res.json()) as EventSearchResponse;
        if (!res.ok || 'error' in json) {
          const message = 'error' in json ? json.error.message : `HTTP ${res.status}`;
          throw new Error(message);
        }
        setEventSuggestions(json.data.events);
      } catch (err) {
        if (controller.signal.aborted) return;
        setEventSuggestions([]);
        setEventSearchError(err instanceof Error ? err.message : 'Event search failed.');
      } finally {
        if (!controller.signal.aborted) {
          setEventSearchLoading(false);
        }
      }
    };

    void runSearch();

    return () => {
      controller.abort();
    };
  }, [eventQuery, selectedClub, selectedEvent, start, end]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEvents(null);

    const startIso = normaliseDateInput(start);
    const endIso = normaliseDateInput(end);
    const club = selectedClub;
    if (!startIso || !endIso) {
      setError('Dates must be valid calendar days.');
      return;
    }
    const days = daysInclusive(startIso, endIso);
    if (!days || days < 1 || days > 7 || !isWithinSixMonths(startIso, endIso)) {
      setError('Date range must be between 1 and 7 days (inclusive).');
      return;
    }
    if (!club) {
      setError('Please select a club from the search results.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/connectors/liverc/discover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // The discovery API now requires a clubId resolved from the search endpoint.
          clubId: club.id,
          startDate: startIso,
          endDate: endIso,
          limit: DISCOVERY_LIMIT,
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

  const showNoClubResults =
    trimmedClubQuery.length >= 2 &&
    !clubSearchLoading &&
    !selectedClub &&
    clubSuggestions.length === 0 &&
    !clubSearchError;

  return (
    <section className={styles.quickImport} aria-labelledby="quick-import-heading">
      <header className={styles.header}>
        <h2 id="quick-import-heading" className={styles.title}>
          LiveRC quick import
        </h2>
        <p className={styles.description}>
          Search by club and date range, then pick events to import.
        </p>
      </header>

      <form onSubmit={onSubmit} className={styles.form}>
        <div className={styles.row}>
          <label htmlFor="start">Search start date</label>
          <input
            id="start"
            type="text"
            placeholder="DD-MM-YYYY"
            inputMode="numeric"
            pattern="(\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2})"
            maxLength={10}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            onBlur={(e) => setStart(toStateDateValue(e.target.value))}
            required
          />
        </div>
        <div className={styles.row}>
          <label htmlFor="end">Search end date</label>
          <input
            id="end"
            type="text"
            placeholder="DD-MM-YYYY"
            inputMode="numeric"
            pattern="(\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2})"
            maxLength={10}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            onBlur={(e) => setEnd(toStateDateValue(e.target.value))}
            required
          />
        </div>
        <div className={styles.row}>
          <label htmlFor="club">Search for club</label>
          <div className={styles.autocomplete}>
            <input
              id="club"
              type="text"
              placeholder="Start typing a club name…"
              value={clubQuery}
              onChange={(e) => {
                setClubQuery(e.target.value);
                // Clear stale selections when the query changes so we do not submit an outdated clubId.
                setSelectedClub(null);
              }}
              role="combobox"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-expanded={clubSuggestions.length > 0}
              aria-controls="club-suggestions"
              aria-describedby="club-search-guidance"
              title={CLUB_SEARCH_TOOLTIP}
              required
            />
            <span id="club-search-guidance" className={styles.visuallyHidden}>
              {CLUB_SEARCH_TOOLTIP}
            </span>
            {clubSearchLoading && <div className={styles.suggestionHint}>Searching…</div>}
            {clubSearchError && <div className={styles.suggestionError}>{clubSearchError}</div>}
            {clubSuggestions.length > 0 && (
              <ul id="club-suggestions" className={styles.suggestions}>
                {clubSuggestions.map((club) => {
                  const location = club.location ? ` — ${club.location}` : '';
                  return (
                    <li key={club.id}>
                      <button
                        className={styles.suggestionButton}
                        type="button"
                        onClick={() => {
                          setSelectedClub(club);
                          setClubQuery(club.name);
                          setClubSuggestions([]);
                        }}
                      >
                        <span className={styles.suggestionName}>{club.name}</span>
                        {location && <span className={styles.suggestionLocation}>{location}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {showNoClubResults && (
              <div className={styles.noResults}>No clubs found. Try another search.</div>
            )}
            {selectedClub && (
              <div className={styles.selectedClubPill}>
                <span className={styles.selectedClubLabel}>
                  Selected club: <strong>{selectedClub.name}</strong>
                </span>
                <button
                  type="button"
                  className={styles.clearSelectedClub}
                  onClick={clearSelectedClub}
                  aria-label="Clear selected club"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>
        {selectedClub && (
          <div className={styles.row}>
            <label htmlFor="event">Search for event (optional)</label>
            <div className={styles.autocomplete}>
              <input
                id="event"
                type="text"
                placeholder="Start typing an event name…"
                value={eventQuery}
                onChange={(e) => {
                  setEventQuery(e.target.value);
                  // Clear stale selections when the query changes
                  setSelectedEvent(null);
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-expanded={eventSuggestions.length > 0}
                aria-controls="event-suggestions"
                aria-describedby="event-search-guidance"
                title={EVENT_SEARCH_TOOLTIP}
              />
              <span id="event-search-guidance" className={styles.visuallyHidden}>
                {EVENT_SEARCH_TOOLTIP}
              </span>
              {eventSearchLoading && <div className={styles.suggestionHint}>Searching…</div>}
              {eventSearchError && <div className={styles.suggestionError}>{eventSearchError}</div>}
              {eventSuggestions.length > 0 && (
                <ul id="event-suggestions" className={styles.suggestions}>
                  {eventSuggestions.map((event) => {
                    const dateStr = event.whenIso
                      ? new Date(event.whenIso + 'T00:00:00Z').toLocaleDateString()
                      : '';
                    return (
                      <li key={event.eventRef}>
                        <button
                          className={styles.suggestionButton}
                          type="button"
                          onClick={() => {
                            setSelectedEvent(event);
                            setEventQuery(event.title);
                            setEventSuggestions([]);
                          }}
                        >
                          <span className={styles.suggestionName}>{event.title}</span>
                          {dateStr && <span className={styles.suggestionLocation}>{dateStr}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {trimmedEventQuery.length >= 2 &&
                !eventSearchLoading &&
                !selectedEvent &&
                eventSuggestions.length === 0 &&
                !eventSearchError && (
                  <div className={styles.noResults}>No events found. Try another search.</div>
                )}
              {selectedEvent && (
                <div className={styles.selectedClubPill}>
                  <span className={styles.selectedClubLabel}>
                    Selected event: <strong>{selectedEvent.title}</strong>
                  </span>
                  <button
                    type="button"
                    className={styles.clearSelectedClub}
                    onClick={clearSelectedEvent}
                    aria-label="Clear selected event"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
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
            <p>No events found for that club and date range.</p>
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
