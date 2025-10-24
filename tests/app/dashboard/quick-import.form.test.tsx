import assert from 'node:assert/strict';
import test from 'node:test';
import '../../helpers/setup-testing-library';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '../../helpers/register-css-module-stub';

const reactGlobal = globalThis as typeof globalThis & { React: typeof React };

reactGlobal.React = React;

// NOTE: If CSS modules break import, add a test-only CSS module stub or export a style-free wrapper.
import LiveRcQuickImport from '../../../src/app/(dashboard)/dashboard/LiveRcQuickImport';

type FetchStub = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response;

const withPatchedFetch = async (stub: FetchStub, run: () => Promise<void>) => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(stub(input, init))) as typeof fetch;
    await run();
  } finally {
    globalThis.fetch = original;
  }
};

test.afterEach(() => {
  cleanup();
});

const setDateField = (input: HTMLInputElement, value: string) => {
  fireEvent.change(input, { target: { value } });
};

void test('button disabled until valid DD-MM-YYYY range and non-empty track/club', async () => {
  render(<LiveRcQuickImport />);

  const start = screen.getByLabelText<HTMLInputElement>(/search start date/i);
  const end = screen.getByLabelText<HTMLInputElement>(/search end date/i);
  const track = screen.getByLabelText<HTMLInputElement>(/track or club name/i);
  const button = screen.getByRole('button', { name: /discover events/i });

  assert.equal(button.hasAttribute('disabled'), true);

  setDateField(start, '2025-10-18');
  setDateField(end, '2025-10-26'); // 9 days
  await userEvent.type(track, 'Canberra');
  assert.equal(button.hasAttribute('disabled'), true); // still invalid (>7)

  setDateField(end, '2025-10-21');
  assert.equal(button.hasAttribute('disabled'), false);
});

void test('valid input triggers POST with ISO dates and `track` key', async () => {
  await withPatchedFetch(
    (_input, init) => {
      const rawBody = init?.body;
      assert.equal(typeof rawBody, 'string');
      if (typeof rawBody !== 'string') {
        throw new TypeError('Expected fetch body to be a string');
      }
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      assert.equal(body.startDate, '2025-10-18');
      assert.equal(body.endDate, '2025-10-21');
      assert.equal(body.track, 'Canberra');
      return new Response(JSON.stringify({ data: { events: [] }, requestId: 't' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    async () => {
      render(<LiveRcQuickImport />);
      setDateField(screen.getByLabelText<HTMLInputElement>(/search start date/i), '18-10-2025');
      setDateField(screen.getByLabelText<HTMLInputElement>(/search end date/i), '21-10-2025');
      await userEvent.type(
        screen.getByLabelText<HTMLInputElement>(/track or club name/i),
        'Canberra',
      );
      await userEvent.click(screen.getByRole('button', { name: /discover events/i }));
    },
  );
});
