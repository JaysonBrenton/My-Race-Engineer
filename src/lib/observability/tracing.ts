import { SpanStatusCode, trace, type AttributeValue } from '@opentelemetry/api';

type Attributes = Partial<Record<string, AttributeValue>>;

type InternalSpan = {
  setAttribute: (key: string, value: AttributeValue) => void;
  recordException: (error: Error) => void;
  setStatus: (status: { code: SpanStatusCode; message?: string }) => void;
  end: () => void;
};

export type SpanAdapter = {
  setAttribute: (key: string, value: AttributeValue | undefined) => void;
};

type InstrumentedTracer = {
  startActiveSpan: <T>(name: string, callback: (span: InternalSpan) => Promise<T>) => Promise<T>;
};

const tracer: InstrumentedTracer = (
  trace as unknown as { getTracer: (name: string) => InstrumentedTracer }
).getTracer('mre');

type SpanCallback<T> = (span: SpanAdapter) => Promise<T> | T;

export type WithSpan = <T>(
  name: string,
  attributes: Attributes,
  callback: SpanCallback<T>,
) => Promise<T>;

const isRedirectLikeError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  if ('digest' in error) {
    const digest = (error as { digest?: unknown }).digest;
    if (
      typeof digest === 'string' &&
      (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND'))
    ) {
      return true;
    }
  }

  return false;
};

export const withSpan: WithSpan = <T>(
  name: string,
  attributes: Attributes,
  callback: SpanCallback<T>,
): Promise<T> => {
  return tracer.startActiveSpan(name, async (span: InternalSpan): Promise<T> => {
    const adapter: SpanAdapter = {
      setAttribute: (key, value) => {
        if (typeof value === 'undefined') {
          return;
        }
        span.setAttribute(key, value);
      },
    };

    try {
      for (const [key, value] of Object.entries(attributes)) {
        if (typeof value === 'undefined') {
          continue;
        }
        span.setAttribute(key, value);
      }

      return await callback(adapter);
    } catch (error) {
      if (!isRedirectLikeError(error)) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : undefined,
        });
      }

      throw error;
    } finally {
      span.end();
    }
  });
};
