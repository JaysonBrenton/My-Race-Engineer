'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import styles from './Wizard.module.css';

type WizardProps = {
  onComplete: (url: string) => void;
};

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;

type WizardHistory = {
  hosts: string[];
  classes: string[];
};

const STORAGE_KEY = 'mre-import-wizard-history-v1';

const emptyHistory: WizardHistory = {
  hosts: [],
  classes: [],
};

const normaliseHost = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/?$/, '')
    .replace(/\/$/, '');

const normaliseSlug = (value: string) => value.trim();

export default function Wizard({ onComplete }: WizardProps) {
  const [step, setStep] = useState<WizardStep>(0);
  const [host, setHost] = useState('');
  const [eventSlug, setEventSlug] = useState('');
  const [classSlug, setClassSlug] = useState('');
  const [roundSlug, setRoundSlug] = useState('');
  const [raceSlug, setRaceSlug] = useState('');
  const [history, setHistory] = useState<WizardHistory>(emptyHistory);
  const [completedUrl, setCompletedUrl] = useState<string | null>(null);

  const hasHydrated = useRef(false);
  const storageWriteFailed = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WizardHistory>;
        setHistory({
          hosts: Array.isArray(parsed.hosts)
            ? [...new Set(parsed.hosts.filter((item) => typeof item === 'string'))]
            : [],
          classes: Array.isArray(parsed.classes)
            ? [...new Set(parsed.classes.filter((item) => typeof item === 'string'))]
            : [],
        });
      }
    } catch {
      setHistory(emptyHistory);
    }

    hasHydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydrated.current || typeof window === 'undefined' || storageWriteFailed.current) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      storageWriteFailed.current = true;
    }
  }, [history]);

  const steps = useMemo(
    () => [
      {
        id: 'host',
        title: 'Club host',
        description: 'Enter the LiveRC club hostname (without https://).',
        value: host,
        setValue: setHost,
        placeholder: 'example.liverc.com',
      },
      {
        id: 'event',
        title: 'Event slug',
        description: 'Use lowercase letters and hyphens only.',
        value: eventSlug,
        setValue: setEventSlug,
        placeholder: 'summer-series-round-1',
      },
      {
        id: 'class',
        title: 'Class slug',
        description: 'Match the class slug used by LiveRC.',
        value: classSlug,
        setValue: setClassSlug,
        placeholder: 'mod-2wd-buggy',
      },
      {
        id: 'round',
        title: 'Round slug',
        description: 'Often the qualifier or main identifier.',
        value: roundSlug,
        setValue: setRoundSlug,
        placeholder: 'qualifier-1',
      },
      {
        id: 'race',
        title: 'Race slug',
        description: 'Usually “race-1”, “main-a1”, etc.',
        value: raceSlug,
        setValue: setRaceSlug,
        placeholder: 'race-1',
      },
    ],
    [host, eventSlug, classSlug, roundSlug, raceSlug],
  );

  const isSummaryStep = step === 5;

  const canonicalUrl = useMemo(() => {
    const trimmedHost = normaliseHost(host);
    const trimmedEvent = normaliseSlug(eventSlug);
    const trimmedClass = normaliseSlug(classSlug);
    const trimmedRound = normaliseSlug(roundSlug);
    const trimmedRace = normaliseSlug(raceSlug);

    if (!trimmedHost || !trimmedEvent || !trimmedClass || !trimmedRound || !trimmedRace) {
      return null;
    }

    return `https://${trimmedHost}/results/${trimmedEvent}/${trimmedClass}/${trimmedRound}/${trimmedRace}.json`;
  }, [host, eventSlug, classSlug, roundSlug, raceSlug]);

  const goNext = useCallback(() => {
    setStep((current) => (current < 5 ? ((current + 1) as WizardStep) : current));
  }, []);

  const goBack = useCallback(() => {
    setStep((current) => (current > 0 ? ((current - 1) as WizardStep) : current));
  }, []);

  const handleSubmitStep = useCallback(() => {
    if (isSummaryStep) {
      if (!canonicalUrl) {
        return;
      }

      onComplete(canonicalUrl);
      setCompletedUrl(canonicalUrl);
      setHistory((previous) => {
        const nextHosts = [
          normaliseHost(host),
          ...previous.hosts.filter((item) => item !== normaliseHost(host)),
        ].filter(Boolean);
        const nextClasses = [
          normaliseSlug(classSlug),
          ...previous.classes.filter((item) => item !== normaliseSlug(classSlug)),
        ].filter(Boolean);

        return {
          hosts: nextHosts.slice(0, 5),
          classes: nextClasses.slice(0, 5),
        };
      });
      return;
    }

    const currentStep = steps[step];
    const trimmedValue =
      currentStep.id === 'host'
        ? normaliseHost(currentStep.value)
        : normaliseSlug(currentStep.value);

    currentStep.setValue(trimmedValue);
    goNext();
  }, [canonicalUrl, classSlug, goNext, host, isSummaryStep, onComplete, step, steps]);

  useEffect(() => {
    if (step === 5 && !canonicalUrl) {
      setStep(4);
    }
  }, [canonicalUrl, step]);

  const currentStep = steps[step] ?? steps[steps.length - 1];

  const canAdvance = useMemo(() => {
    if (isSummaryStep) {
      return Boolean(canonicalUrl);
    }

    const value = currentStep.value.trim();
    return value.length > 0;
  }, [canonicalUrl, currentStep.value, isSummaryStep]);

  const showSuggestions = currentStep.id === 'host' && history.hosts.length > 0;
  const showExamples = currentStep.id === 'class' && history.classes.length > 0;

  return (
    <div className={styles.wizard}>
      <p className={styles.stepIndicator}>
        Step {Math.min(step + 1, steps.length + 1)} of {steps.length + 1}
      </p>
      {isSummaryStep ? (
        <div className={styles.summaryCard}>
          <h3 className={styles.stepTitle}>Summary</h3>
          <p className={styles.stepDescription}>
            Confirm the generated JSON link and send it to the import form.
          </p>
          {canonicalUrl ? <p className={styles.previewUrl}>{canonicalUrl}</p> : null}
          <ol className={styles.summaryList}>
            <li>Host: {normaliseHost(host)}</li>
            <li>Event: {normaliseSlug(eventSlug)}</li>
            <li>Class: {normaliseSlug(classSlug)}</li>
            <li>Round: {normaliseSlug(roundSlug)}</li>
            <li>Race: {normaliseSlug(raceSlug)}</li>
          </ol>
          {completedUrl ? (
            <p className={styles.tooltip}>Link sent to the form. You can close the wizard.</p>
          ) : null}
        </div>
      ) : (
        <div className={styles.helperRow}>
          <h3 className={styles.stepTitle}>{currentStep.title}</h3>
          <p className={styles.stepDescription}>{currentStep.description}</p>
          {currentStep.id === 'event' ? (
            <p className={styles.tooltip}>Tip: lowercase, hyphens</p>
          ) : null}
          <input
            key={currentStep.id}
            className={styles.input}
            value={currentStep.value}
            onChange={(event) => {
              currentStep.setValue(event.target.value);
              setCompletedUrl(null);
            }}
            placeholder={currentStep.placeholder}
            autoComplete="off"
            spellCheck={false}
          />
          {showSuggestions ? (
            <ul className={styles.suggestions}>
              {history.hosts.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    className={styles.chipButton}
                    onClick={() => currentStep.setValue(item)}
                  >
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {showExamples ? (
            <div className={styles.helperRow}>
              <p className={styles.tooltip}>Recent class slugs</p>
              <ul className={styles.examples}>
                {history.classes.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      className={styles.chipButton}
                      onClick={() => currentStep.setValue(item)}
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      <div className={styles.controls}>
        <button type="button" className={styles.backButton} onClick={goBack} disabled={step === 0}>
          Back
        </button>
        <button
          type="button"
          className={styles.nextButton}
          onClick={handleSubmitStep}
          disabled={!canAdvance}
        >
          {isSummaryStep ? 'Send to form' : 'Next'}
        </button>
      </div>
      {!isSummaryStep && canonicalUrl ? <p className={styles.previewUrl}>{canonicalUrl}</p> : null}
    </div>
  );
}
