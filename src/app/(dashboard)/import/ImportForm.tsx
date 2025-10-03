'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';

import {
  LiveRcUrlInvalidReasons,
  type LiveRcJsonUrlParseResult,
  type LiveRcUrlParseResult,
  parseLiveRcUrl,
} from '@core/app/services/liveRcUrlParser';
import type { LiveRcImportSummary } from '@core/app/services/importLiveRc';

import styles from './ImportForm.module.css';
import Wizard from './Wizard';

type ImportFormProps = {
  enableWizard?: boolean;
  initialUrl?: string;
};

type ParsedState =
  | { kind: 'empty' }
  | { kind: 'invalid'; message: string }
  | { kind: 'html' }
  | {
      kind: 'json';
      result: LiveRcJsonUrlParseResult;
      canonicalAbsoluteJsonUrl: string;
      wasMissingJsonSuffix: boolean;
    };

type ImportSuccess = {
  status: 'success';
  summary: LiveRcImportSummary;
  requestId?: string;
};

type ImportFailure = {
  status: 'error';
  statusCode: number;
  requestId?: string;
  error: unknown;
};

type SubmissionState = ImportSuccess | ImportFailure | null;

type BulkImportRowStatus = 'idle' | 'queued' | 'importing' | 'done' | 'error';

type BulkImportRowType = 'json' | 'html' | 'invalid';

type BulkImportRow = {
  id: string;
  input: string;
  host: string;
  type: BulkImportRowType;
  slugs?: [string, string, string, string];
  canonicalAbsoluteJsonUrl?: string;
  status: BulkImportRowStatus;
  statusMessage?: string;
  requestId?: string;
};

const slugToTitle = (slug: string) =>
  slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const resolverEnabled = process.env.ENABLE_LIVERC_RESOLVER === '1';
const hasInternalProxy =
  typeof process.env.LIVERC_HTTP_BASE === 'string' && process.env.LIVERC_HTTP_BASE.length > 0;

const parseInput = (value: string): ParsedState => {
  const trimmed = value.trim();

  if (!trimmed) {
    return { kind: 'empty' };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return { kind: 'invalid', message: LiveRcUrlInvalidReasons.INVALID_ABSOLUTE_URL };
  }

  let result: LiveRcUrlParseResult;
  try {
    result = parseLiveRcUrl(trimmed);
  } catch {
    return { kind: 'invalid', message: LiveRcUrlInvalidReasons.INVALID_ABSOLUTE_URL };
  }

  if (result.type === 'invalid') {
    return { kind: 'invalid', message: result.reasonIfInvalid };
  }

  if (result.type === 'html') {
    return { kind: 'html' };
  }

  const canonicalAbsoluteJsonUrl = new URL(result.canonicalJsonPath, parsedUrl.origin).toString();
  const lastSegment = parsedUrl.pathname.split('/').filter(Boolean).slice(-1)[0] ?? '';
  const hadJsonSuffix = /\.json$/i.test(lastSegment);

  return {
    kind: 'json',
    result,
    canonicalAbsoluteJsonUrl,
    wasMissingJsonSuffix: !hadJsonSuffix,
  };
};

const formatError = (error: unknown) => {
  if (!error) {
    return 'Unknown error while importing.';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return 'Unexpected error payload.';
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isImportSummary = (value: unknown): value is LiveRcImportSummary => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.eventId === 'string' &&
    typeof value.raceClassId === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.raceId === 'string' &&
    typeof value.sourceUrl === 'string'
  );
};

const parseBulkInput = (value: string): BulkImportRow[] => {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line, index) => {
    const id = `${index}-${line}`;
    let parsedUrl: URL | null = null;

    try {
      parsedUrl = new URL(line);
    } catch {
      parsedUrl = null;
    }

    let result: LiveRcUrlParseResult;
    try {
      result = parseLiveRcUrl(line);
    } catch {
      return {
        id,
        input: line,
        host: parsedUrl ? parsedUrl.host : '',
        type: 'invalid',
        status: 'idle',
        statusMessage: LiveRcUrlInvalidReasons.INVALID_ABSOLUTE_URL,
      };
    }

    if (result.type === 'json') {
      const canonicalAbsoluteJsonUrl = parsedUrl
        ? new URL(result.canonicalJsonPath, parsedUrl.origin).toString()
        : line;

      return {
        id,
        input: line,
        host: parsedUrl ? parsedUrl.host : '',
        type: 'json',
        slugs: result.slugs,
        canonicalAbsoluteJsonUrl,
        status: 'idle',
      } satisfies BulkImportRow;
    }

    if (result.type === 'html') {
      return {
        id,
        input: line,
        host: parsedUrl ? parsedUrl.host : '',
        type: 'html',
        status: 'idle',
        statusMessage: 'Needs JSON',
      } satisfies BulkImportRow;
    }

    return {
      id,
      input: line,
      host: parsedUrl ? parsedUrl.host : '',
      type: 'invalid',
      status: 'idle',
      statusMessage: result.reasonIfInvalid,
    } satisfies BulkImportRow;
  });
};

type StatusTone = 'default' | 'info' | 'success' | 'danger' | 'warning';

const summariseStatusMessage = (message?: string) => {
  if (!message) {
    return undefined;
  }

  const trimmed = message.trim();
  if (!trimmed) {
    return undefined;
  }

  const [firstLine] = trimmed.split('\n');
  if (!firstLine) {
    return undefined;
  }

  if (firstLine.length > 140) {
    return `${firstLine.slice(0, 137)}…`;
  }

  return firstLine;
};

const getStatusDescriptor = (
  row: BulkImportRow,
): { label: string; tone: StatusTone; note?: string } => {
  if (row.type === 'html') {
    return {
      label: 'Needs JSON',
      tone: 'warning',
      note: summariseStatusMessage(row.statusMessage),
    };
  }

  if (row.type === 'invalid') {
    return { label: 'Invalid', tone: 'danger', note: summariseStatusMessage(row.statusMessage) };
  }

  if (row.status === 'queued') {
    return { label: 'Queued', tone: 'info' };
  }

  if (row.status === 'importing') {
    return { label: 'Importing', tone: 'info' };
  }

  if (row.status === 'done') {
    return { label: 'Done', tone: 'success', note: summariseStatusMessage(row.statusMessage) };
  }

  if (row.status === 'error') {
    return { label: 'Error', tone: 'danger', note: summariseStatusMessage(row.statusMessage) };
  }

  return { label: 'Ready', tone: 'default' };
};

const BulkImportTab = ({
  tabPanelId,
  labelledById,
}: {
  tabPanelId: string;
  labelledById: string;
}) => {
  const [bulkInput, setBulkInput] = useState('');
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const readyRows = useMemo(
    () =>
      rows.filter(
        (row): row is BulkImportRow & { type: 'json'; canonicalAbsoluteJsonUrl: string } =>
          row.type === 'json' && typeof row.canonicalAbsoluteJsonUrl === 'string',
      ),
    [rows],
  );

  const handleBulkInputChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setBulkInput(nextValue);
    setRows(parseBulkInput(nextValue));
  }, []);

  const handleImportAll = useCallback(async () => {
    if (isImporting || readyRows.length === 0) {
      return;
    }

    setIsImporting(true);
    setRows((previous) =>
      previous.map((row) =>
        row.type === 'json'
          ? { ...row, status: 'queued', statusMessage: undefined, requestId: undefined }
          : row,
      ),
    );

    try {
      for (const row of readyRows) {
        setRows((previous) =>
          previous.map((current) =>
            current.id === row.id
              ? { ...current, status: 'importing', statusMessage: undefined, requestId: undefined }
              : current,
          ),
        );

        try {
          const response = await fetch('/api/liverc/import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: row.canonicalAbsoluteJsonUrl,
              includeOutlaps: false,
            }),
          });

          const payload: unknown = await response.json().catch(() => null);
          const requestId =
            isRecord(payload) && typeof payload.requestId === 'string'
              ? payload.requestId
              : undefined;

          if (response.ok) {
            setRows((previous) =>
              previous.map((current) =>
                current.id === row.id
                  ? {
                      ...current,
                      status: 'done',
                      statusMessage: requestId ? `Request ${requestId}` : undefined,
                      requestId,
                    }
                  : current,
              ),
            );
            continue;
          }

          let errorPayload: unknown = payload;
          if (isRecord(payload) && 'error' in payload) {
            errorPayload = payload.error;
          }

          setRows((previous) =>
            previous.map((current) =>
              current.id === row.id
                ? {
                    ...current,
                    status: 'error',
                    statusMessage: formatError(errorPayload),
                    requestId,
                  }
                : current,
            ),
          );
        } catch (error) {
          setRows((previous) =>
            previous.map((current) =>
              current.id === row.id
                ? {
                    ...current,
                    status: 'error',
                    statusMessage: formatError(error),
                  }
                : current,
            ),
          );
        }
      }
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, readyRows]);

  const toneClassMap: Record<StatusTone, string> = {
    default: styles.statusToneDefault,
    info: styles.statusToneInfo,
    success: styles.statusToneSuccess,
    danger: styles.statusToneDanger,
    warning: styles.statusToneWarning,
  };

  return (
    <section
      id={tabPanelId}
      className={styles.bulkSection}
      role="tabpanel"
      aria-labelledby={labelledById}
    >
      <div className={styles.inputGroup}>
        <label className={styles.label} htmlFor="bulk-liverc-urls">
          Paste multiple LiveRC links (one per line)
        </label>
        <textarea
          id="bulk-liverc-urls"
          className={styles.bulkTextarea}
          placeholder="https://www.liverc.com/..."
          value={bulkInput}
          onChange={handleBulkInputChange}
          spellCheck={false}
        />
        <p className={styles.helper}>
          JSON-ready rows import sequentially. HTML and invalid links are skipped.
        </p>
      </div>
      {rows.length > 0 ? (
        <div className={styles.bulkTableWrapper}>
          <table className={styles.bulkTable}>
            <thead>
              <tr>
                <th scope="col">Host</th>
                <th scope="col">Event</th>
                <th scope="col">Class</th>
                <th scope="col">Round</th>
                <th scope="col">Race</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const descriptor = getStatusDescriptor(row);
                const statusClassName = `${styles.statusBadge} ${toneClassMap[descriptor.tone]}`;
                const [eventSlug, classSlug, roundSlug, raceSlug] = row.slugs ?? [];

                return (
                  <tr key={row.id}>
                    <td>{row.host || '—'}</td>
                    <td>{eventSlug ? slugToTitle(eventSlug) : '—'}</td>
                    <td>{classSlug ? slugToTitle(classSlug) : '—'}</td>
                    <td>{roundSlug ? slugToTitle(roundSlug) : '—'}</td>
                    <td>{raceSlug ? slugToTitle(raceSlug) : '—'}</td>
                    <td>
                      <div className={styles.statusCell}>
                        <span className={statusClassName}>{descriptor.label}</span>
                        {descriptor.note ? (
                          <span className={styles.statusNote} title={row.statusMessage}>
                            {descriptor.note}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.bulkEmptyState}>
          Paste LiveRC links above to preview their import status.
        </p>
      )}
      <div className={styles.bulkActions}>
        <button
          type="button"
          className={styles.importButton}
          onClick={handleImportAll}
          disabled={isImporting || readyRows.length === 0}
        >
          {isImporting ? 'Importing…' : 'Import all'}
        </button>
        <p className={styles.helper}>
          {readyRows.length === 0
            ? 'Add LiveRC JSON links above to enable bulk import.'
            : `Queued imports run one at a time (${readyRows.length} ready).`}
        </p>
      </div>
    </section>
  );
};

export default function ImportForm({ enableWizard = false, initialUrl }: ImportFormProps) {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [url, setUrl] = useState(() => initialUrl ?? '');
  const [tipsOpen, setTipsOpen] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const parsed = useMemo(() => parseInput(url), [url]);
  const tabSetId = useId();
  const resolveModalTitleId = useId();
  const singleTabId = `${tabSetId}-single-tab`;
  const bulkTabId = `${tabSetId}-bulk-tab`;
  const singlePanelId = `${tabSetId}-single-panel`;
  const bulkPanelId = `${tabSetId}-bulk-panel`;

  const handleSelectSingle = useCallback(() => {
    setActiveTab('single');
  }, []);

  const handleSelectBulk = useCallback(() => {
    setActiveTab('bulk');
  }, []);

  useEffect(() => {
    if (typeof initialUrl === 'string' && initialUrl.length > 0) {
      setUrl(initialUrl);
      setSubmission(null);
    }
  }, [initialUrl]);

  useEffect(() => {
    if (parsed.kind !== 'html' && tipsOpen) {
      setTipsOpen(false);
    }
  }, [parsed.kind, tipsOpen]);

  useEffect(() => {
    if (parsed.kind !== 'html' && resolveModalOpen) {
      setResolveModalOpen(false);
    }
  }, [parsed.kind, resolveModalOpen]);

  useEffect(() => {
    if (activeTab === 'bulk') {
      if (tipsOpen) {
        setTipsOpen(false);
      }
      if (wizardOpen) {
        setWizardOpen(false);
      }
      if (resolveModalOpen) {
        setResolveModalOpen(false);
      }
    }
  }, [activeTab, resolveModalOpen, tipsOpen, wizardOpen]);

  const handleResolve = () => {
    if (!resolverEnabled) {
      return;
    }

    if (parsed.kind === 'json' && parsed.wasMissingJsonSuffix) {
      setUrl(parsed.canonicalAbsoluteJsonUrl);
      setSubmission(null);
      return;
    }

    if (parsed.kind === 'html') {
      setResolveModalOpen(true);
    }
  };

  const handleCloseResolveModal = () => {
    setResolveModalOpen(false);
  };

  const shouldShowResolveButton =
    resolverEnabled &&
    (parsed.kind === 'html' || (parsed.kind === 'json' && parsed.wasMissingJsonSuffix));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (parsed.kind !== 'json') {
      return;
    }

    setIsSubmitting(true);
    setSubmission(null);

    try {
      const response = await fetch('/api/liverc/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: parsed.canonicalAbsoluteJsonUrl,
          includeOutlaps: false,
        }),
      });

      const payload: unknown = await response.json().catch(() => null);
      const requestId =
        isRecord(payload) && typeof payload.requestId === 'string' ? payload.requestId : undefined;

      if (response.ok) {
        const summary =
          isRecord(payload) && 'data' in payload && isImportSummary(payload.data)
            ? payload.data
            : undefined;

        if (summary) {
          setSubmission({
            status: 'success',
            summary,
            requestId,
          });
          return;
        }

        setSubmission({
          status: 'error',
          statusCode: response.status,
          requestId,
          error: 'Import succeeded but response payload was missing summary data.',
        });
        return;
      }

      setSubmission({
        status: 'error',
        statusCode: response.status,
        requestId,
        error: isRecord(payload) && 'error' in payload ? payload.error : payload,
      });
    } catch (error) {
      setSubmission({
        status: 'error',
        statusCode: 0,
        error,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPreview = () => {
    if (parsed.kind === 'empty') {
      return null;
    }

    if (parsed.kind === 'invalid') {
      return <p className={styles.error}>{parsed.message}</p>;
    }

    if (parsed.kind === 'html') {
      return (
        <div className={styles.previewCard}>
          <div className={styles.previewHeader}>
            <span className={styles.badge}>Needs resolving</span>
            <h2 className={styles.previewTitle}>Legacy LiveRC page detected</h2>
            <p className={styles.helper}>
              This link points to the older HTML results page. Resolve it to a JSON results URL
              before importing.
            </p>
          </div>
          {shouldShowResolveButton ? (
            <div className={styles.previewActions}>
              <button type="button" className={styles.resolveButton} onClick={handleResolve}>
                Resolve
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className={styles.tipsToggle}
            onClick={() => setTipsOpen((previous) => !previous)}
            aria-expanded={tipsOpen}
          >
            How to get the JSON link
          </button>
          {tipsOpen ? (
            <div className={styles.tipsPanel}>
              <p className={styles.helper}>You can use your browser&rsquo;s developer tools:</p>
              <ol className={styles.tipsList}>
                <li>Open the LiveRC race page in a new tab.</li>
                <li>Launch DevTools (Cmd/Ctrl+Shift+I) and switch to the Network tab.</li>
                <li>
                  Reload the page and filter for “.json” requests under <code>/results/</code>.
                </li>
                <li>
                  Right-click the matching request and choose “Copy → Copy link address”.
                  <br />
                  Paste that JSON link here.
                </li>
              </ol>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className={styles.previewCard}>
        <div className={styles.previewHeader}>
          <h2 className={styles.previewTitle}>Import ready</h2>
          <p className={styles.helper}>
            Review the detected event details before sending the import request.
          </p>
        </div>
        <div className={styles.detailsList}>
          <div className={styles.detailsItem}>
            <p className={styles.detailLabel}>Event</p>
            <p className={styles.detailValue}>{slugToTitle(parsed.result.slugs[0])}</p>
          </div>
          <div className={styles.detailsItem}>
            <p className={styles.detailLabel}>Class</p>
            <p className={styles.detailValue}>{slugToTitle(parsed.result.slugs[1])}</p>
          </div>
          <div className={styles.detailsItem}>
            <p className={styles.detailLabel}>Round</p>
            <p className={styles.detailValue}>{slugToTitle(parsed.result.slugs[2])}</p>
          </div>
          <div className={styles.detailsItem}>
            <p className={styles.detailLabel}>Race</p>
            <p className={styles.detailValue}>{slugToTitle(parsed.result.slugs[3])}</p>
          </div>
        </div>
        <div className={styles.actions}>
          {shouldShowResolveButton ? (
            <button type="button" className={styles.resolveButton} onClick={handleResolve}>
              Resolve
            </button>
          ) : null}
          <button type="submit" className={styles.importButton} disabled={isSubmitting}>
            {isSubmitting ? 'Importing…' : 'Import'}
          </button>
          <p className={styles.helper}>{parsed.canonicalAbsoluteJsonUrl}</p>
        </div>
      </div>
    );
  };

  const singleTabClassName = `${styles.tabButton} ${
    activeTab === 'single' ? styles.tabButtonActive : ''
  }`.trim();
  const bulkTabClassName = `${styles.tabButton} ${
    activeTab === 'bulk' ? styles.tabButtonActive : ''
  }`.trim();

  return (
    <div className={styles.formWrapper}>
      <div className={styles.tabList} role="tablist" aria-label="Import mode">
        <button
          type="button"
          id={singleTabId}
          className={singleTabClassName}
          role="tab"
          aria-selected={activeTab === 'single'}
          aria-controls={singlePanelId}
          onClick={handleSelectSingle}
        >
          Single link
        </button>
        <button
          type="button"
          id={bulkTabId}
          className={bulkTabClassName}
          role="tab"
          aria-selected={activeTab === 'bulk'}
          aria-controls={bulkPanelId}
          onClick={handleSelectBulk}
        >
          Bulk import
        </button>
      </div>
      {activeTab === 'single' ? (
        <form
          className={styles.form}
          onSubmit={handleSubmit}
          id={singlePanelId}
          role="tabpanel"
          aria-labelledby={singleTabId}
        >
          {enableWizard ? (
            <section className={styles.wizardSection}>
              <div className={styles.wizardHeader}>
                <p className={styles.wizardTitle}>Need help finding the JSON link?</p>
                <button
                  type="button"
                  className={styles.wizardToggle}
                  onClick={() => setWizardOpen((previous) => !previous)}
                  aria-expanded={wizardOpen}
                >
                  {wizardOpen ? 'Hide wizard' : 'Open wizard'}
                </button>
              </div>
              {wizardOpen ? (
                <Wizard
                  onComplete={(wizardUrl) => {
                    setUrl(wizardUrl);
                    setSubmission(null);
                    setWizardOpen(false);
                  }}
                />
              ) : null}
            </section>
          ) : null}
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="liverc-url">
              LiveRC link
            </label>
            <input
              id="liverc-url"
              name="liverc-url"
              className={styles.input}
              placeholder="Paste a LiveRC link (page or .json)"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setSubmission(null);
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <p className={styles.helper}>
              We only parse the link locally. The import request is sent once you confirm.
            </p>
          </div>
          {renderPreview()}
          {submission ? (
            <div className={styles.responsePanel}>
              <h3 className={styles.responseTitle}>
                {submission.status === 'success' ? 'Import queued' : 'Import failed'}
              </h3>
              {'requestId' in submission && submission.requestId ? (
                <p className={styles.responseMeta}>Request ID: {submission.requestId}</p>
              ) : null}
              {submission.status === 'success' ? (
                <pre className={styles.responsePre}>
                  {JSON.stringify(submission.summary, null, 2)}
                </pre>
              ) : (
                <pre className={styles.responsePre}>{formatError(submission.error)}</pre>
              )}
            </div>
          ) : null}
        </form>
      ) : (
        <BulkImportTab tabPanelId={bulkPanelId} labelledById={bulkTabId} />
      )}
      {resolverEnabled && resolveModalOpen ? (
        <div className={styles.modalBackdrop} role="presentation">
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby={resolveModalTitleId}
          >
            <h3 className={styles.modalTitle} id={resolveModalTitleId}>
              Resolve LiveRC HTML links
            </h3>
            <div className={styles.modalBody}>
              {hasInternalProxy ? (
                <>
                  <p>
                    QA builds are wired to the internal LiveRC proxy. Swap the HTML link for one of
                    the JSON fixtures under
                    <code>fixtures/liverc/results/</code>.
                  </p>
                  <p>
                    Serve it through the proxy by appending <code>?proxy=1</code> in QA.
                  </p>
                  <p>
                    The QA network access playbook covers the full workflow and fixture rollover
                    steps.
                    <a
                      href="https://github.com/JaysonBrenton/My-Race-Engineer/blob/main/docs/guardrails/qa-network-access.md"
                      target="_blank"
                      rel="noreferrer"
                      className={styles.modalLink}
                    >
                      Review the QA guide
                    </a>
                  </p>
                </>
              ) : (
                <p>
                  We can’t resolve this HTML page automatically. Open the LiveRC page in a new tab
                  and use your browser’s DevTools Network panel to copy the matching{' '}
                  <code>.json</code> request into this form.
                </p>
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.resolveButton}
                onClick={handleCloseResolveModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
