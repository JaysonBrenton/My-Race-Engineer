import { SpanStatusCode, trace, type AttributeValue, type Span } from '@opentelemetry/api';

const tracer = trace.getTracer('mre');

type Attributes = Record<string, AttributeValue | undefined>;

type SpanCallback<T> = (span: Span) => Promise<T> | T;

const isRedirectLikeError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  if ('digest' in error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND'))) {
      return true;
    }
  }

  return false;
};

export const withSpan = async <T>(
  name: string,
  attributes: Attributes,
  callback: SpanCallback<T>,
): Promise<T> =>
  tracer.startActiveSpan(name, async (span) => {
    try {
      for (const [key, value] of Object.entries(attributes)) {
        if (typeof value === 'undefined') {
          continue;
        }
        span.setAttribute(key, value);
      }

      return await callback(span);
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
