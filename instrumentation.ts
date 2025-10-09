import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, ConsoleSpanExporter, type SpanExporter } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

type HeaderRecord = Record<string, string>;

const parseHeaders = (raw: string | undefined): HeaderRecord | undefined => {
  if (!raw) {
    return undefined;
  }

  const headerEntries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.split('=', 2).map((segment) => segment.trim()))
    .filter((parts): parts is [string, string] => parts.length === 2 && parts[0].length > 0);

  if (headerEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(headerEntries);
};

const createExporter = (): SpanExporter => {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const headers = parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);

  if (!endpoint) {
    return new ConsoleSpanExporter();
  }

  return new OTLPTraceExporter({
    url: endpoint,
    headers,
  });
};

const globalMarker = '__mre_tracing_initialised__' as const;

type GlobalWithTracingFlag = typeof globalThis & {
  [globalMarker]?: boolean;
};

export const register = () => {
  const tracingEnabled = process.env.TRACING_ENABLED?.toLowerCase() === 'true';
  if (!tracingEnabled) {
    return;
  }

  const globalObject = globalThis as GlobalWithTracingFlag;
  if (globalObject[globalMarker]) {
    return;
  }
  globalObject[globalMarker] = true;

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'my-race-engineer';
  const serviceVersion = process.env.npm_package_version || '0.0.0';
  const environment = process.env.NEXT_PUBLIC_ENV || process.env.NODE_ENV || 'development';

  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
    }),
  });

  provider.addSpanProcessor(new BatchSpanProcessor(createExporter()));
  provider.register();

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({ ignoreIncomingPaths: [/^\/(_next|static)\//] }),
      new FetchInstrumentation(),
    ],
  });
};
