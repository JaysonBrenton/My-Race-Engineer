import type { LiveRcJsonUrlParseResult } from '@core/app/services/liveRcUrlParser';

export type ParsedState =
  | { kind: 'empty' }
  | { kind: 'invalid'; message: string }
  | { kind: 'html' }
  | {
      kind: 'json';
      result: LiveRcJsonUrlParseResult;
      canonicalAbsoluteJsonUrl: string;
      wasMissingJsonSuffix: boolean;
    };

export const canShowResolveButton = (resolverEnabled: boolean, parsed: ParsedState): boolean =>
  resolverEnabled &&
  (parsed.kind === 'html' || (parsed.kind === 'json' && parsed.wasMissingJsonSuffix));
