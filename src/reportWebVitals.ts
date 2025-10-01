import type { NextWebVitalsMetric } from 'next/app';

const trackedMetrics = new Set<NextWebVitalsMetric['name']>(['CLS', 'LCP', 'INP']);

export function reportWebVitals(metric: NextWebVitalsMetric) {
  if (!trackedMetrics.has(metric.name)) {
    return;
  }

  const body = JSON.stringify({
    id: metric.id,
    name: metric.name,
    label: metric.label,
    value: Number(metric.value.toFixed(4)),
    page: window.location.pathname,
    timestamp: Date.now(),
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/web-vitals', body);
    return;
  }

  fetch('/api/web-vitals', {
    method: 'POST',
    body,
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
    },
  }).catch(() => {
    // Swallow network errors so metrics collection never blocks the UX.
  });
}
