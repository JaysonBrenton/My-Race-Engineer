import type { NextResponse } from 'next/server';

export type AuthActionName = 'register' | 'login';

export type AuthTokenDebugStatus = 'ok' | 'invalid' | 'expired' | 'missing';

export type AuthActionDebugEvent =
  | {
      type: 'token-validation';
      status: AuthTokenDebugStatus;
      reason?: string;
      fingerprint?: string | null;
      ageMs?: number | null;
    }
  | {
      type: 'outcome';
      kind: 'redirect' | 'rerender';
      target?: string;
      statusKey?: string | null;
    };

export type AuthActionDebugSnapshot = {
  action: AuthActionName;
  token?: {
    status: AuthTokenDebugStatus;
    reason?: string;
    fingerprint?: string;
    ageMs?: number | null;
  };
  outcome?: {
    kind: 'redirect' | 'rerender';
    target?: string;
    statusKey?: string | null;
  };
};

export type AuthActionDebugRecorder = {
  record: (event: AuthActionDebugEvent) => void;
  snapshot: () => AuthActionDebugSnapshot;
};

export const createAuthActionDebugRecorder = (action: AuthActionName): AuthActionDebugRecorder => {
  const state: AuthActionDebugSnapshot = { action };

  return {
    record: (event: AuthActionDebugEvent) => {
      if (event.type === 'token-validation') {
        state.token = {
          status: event.status,
          reason: event.reason,
          fingerprint: event.fingerprint ?? undefined,
          ageMs: event.ageMs ?? undefined,
        };
      } else if (event.type === 'outcome') {
        state.outcome = {
          kind: event.kind,
          target: event.target,
          statusKey: event.statusKey ?? undefined,
        };
      }
    },
    snapshot: () => ({
      action,
      token: state.token ? { ...state.token } : undefined,
      outcome: state.outcome ? { ...state.outcome } : undefined,
    }),
  };
};

export const applyAuthDebugHeaders = (
  response: NextResponse,
  snapshot: AuthActionDebugSnapshot,
) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  response.headers.set('x-auth-action', snapshot.action);
  response.headers.set('x-auth-token', snapshot.token?.status ?? 'missing');
  response.headers.set('x-auth-outcome', snapshot.outcome?.kind ?? 'unknown');
};
