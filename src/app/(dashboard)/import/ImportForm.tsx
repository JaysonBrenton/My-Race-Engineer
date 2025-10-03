'use client';

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';

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

export default function ImportForm({ enableWizard = false, initialUrl }: ImportFormProps) {
  const [url, setUrl] = useState(() => initialUrl ?? '');
  const [tipsOpen, setTipsOpen] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const parsed = useMemo(() => parseInput(url), [url]);
  const resolveModalTitleId = useId();

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

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
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
            <pre className={styles.responsePre}>{JSON.stringify(submission.summary, null, 2)}</pre>
          ) : (
            <pre className={styles.responsePre}>{formatError(submission.error)}</pre>
          )}
        </div>
      ) : null}
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
    </form>
  );
}
