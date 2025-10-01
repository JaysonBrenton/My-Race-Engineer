import type { NextWebVitalsMetric } from 'next/app';

// Limit the list of metrics we forward so we only capture the signals we
// actively monitor. CLS, LCP, and INP line up with Google's Core Web Vitals.
const trackedMetrics = new Set<NextWebVitalsMetric['name']>(['CLS', 'LCP', 'INP']);

export function reportWebVitals(metric: NextWebVitalsMetric) {
  // Ignore any metrics we do not track to avoid noise in the analytics backend.
  if (!trackedMetrics.has(metric.name)) {
    return;
  }

  // Serialize the payload with the metric information and useful context for
  // downstream analysis, such as the page path and a timestamp.
  const body = JSON.stringify({
    id: metric.id,
    name: metric.name,
    label: metric.label,
    value: Number(metric.value.toFixed(4)),
    page: window.location.pathname,
    timestamp: Date.now(),
  });

  // Prefer navigator.sendBeacon when available to ensure the request is fired
  // even if the page is unloading (e.g., user navigates away).
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/web-vitals', body);
    return;
  }

  // Fallback to fetch for browsers that do not support sendBeacon. The keepalive
  // flag allows the POST to complete during page unload events.
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
