/**
 * Project: My Race Engineer
 * File: tests/app/dashboard/quick-import.form.test.tsx
 * Summary: UI tests for the dashboard LiveRC quick import flow using club search and discovery.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import '../../helpers/setup-testing-library';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '../../helpers/register-css-module-stub';

const ReactForTests = React;

Object.assign(globalThis as typeof globalThis & { React: typeof import('react') }, {
  React: ReactForTests,
});

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

const toRequestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  throw new TypeError('Unexpected fetch input type.');
};

test.afterEach(() => {
  cleanup();
});

const setDateField = (input: HTMLInputElement, value: string) => {
  fireEvent.change(input, { target: { value } });
};

void test('button disabled until valid DD-MM-YYYY range and club is selected', async () => {
  await withPatchedFetch(
    (input) => {
      const url = toRequestUrl(input);
      if (url.includes('/api/connectors/liverc/clubs/search')) {
        return new Response(
          JSON.stringify({
            data: { clubs: [{ id: 'club-1', name: 'Canberra RC', location: 'ACT' }] },
            requestId: 'clubs',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    },
    async () => {
      render(<LiveRcQuickImport />);

      const start = screen.getByLabelText<HTMLInputElement>(/search start date/i);
      const end = screen.getByLabelText<HTMLInputElement>(/search end date/i);
      const club = screen.getByLabelText<HTMLInputElement>(/search for club/i);
      const button = screen.getByRole('button', { name: /search/i });

      assert.equal(button.hasAttribute('disabled'), true);

      setDateField(start, '2025-10-18');
      setDateField(end, '2025-10-26'); // 9 days
      await userEvent.type(club, 'Canberra');
      const suggestion = await screen.findByRole('button', { name: /Canberra RC/ });
      await userEvent.click(suggestion);
      const selectedPills = await screen.findAllByText(
        (content, element) =>
          element?.textContent?.toLowerCase().includes('selected club: canberra rc') ?? false,
      );
      assert.ok(selectedPills.length > 0);
      assert.equal(button.hasAttribute('disabled'), true); // still invalid (>7)

      setDateField(end, '2025-10-21');
      assert.equal(button.hasAttribute('disabled'), false);
    },
  );
});

void test('valid input triggers POST with clubId and renders results', async () => {
  await withPatchedFetch(
    (input, init) => {
      const url = toRequestUrl(input);
      if (url.includes('/api/connectors/liverc/clubs/search')) {
        return new Response(
          JSON.stringify({
            data: {
              clubs: [
                { id: 'club-1', name: 'Canberra RC', location: 'ACT' },
                { id: 'club-2', name: 'Keilor Track', location: 'VIC' },
              ],
            },
            requestId: 'clubs',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.includes('/api/connectors/liverc/discover')) {
        const rawBody = init?.body;
        if (typeof rawBody !== 'string') {
          throw new TypeError('Expected fetch body to be serialised JSON string.');
        }
        const body = JSON.parse(rawBody) as Record<string, unknown>;
        assert.equal(body.startDate, '2025-10-18');
        assert.equal(body.endDate, '2025-10-21');
        assert.equal(body.clubId, 'club-1');
        assert.equal(Object.prototype.hasOwnProperty.call(body, 'track'), false);
        return new Response(
          JSON.stringify({
            data: {
              events: [
                {
                  eventRef: 'https://liverc.com/e1',
                  title: 'Round 1',
                  whenIso: '2025-10-18T10:00:00Z',
                  score: 0,
                },
              ],
            },
            requestId: 'discover',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      throw new Error(`Unexpected fetch to ${url}`);
    },
    async () => {
      render(<LiveRcQuickImport />);
      setDateField(screen.getByLabelText<HTMLInputElement>(/search start date/i), '18-10-2025');
      setDateField(screen.getByLabelText<HTMLInputElement>(/search end date/i), '21-10-2025');
      await userEvent.type(screen.getByLabelText<HTMLInputElement>(/search for club/i), 'Can');
      const suggestion = await screen.findByRole('button', { name: /Canberra RC/ });
      await userEvent.click(suggestion);
      const selectedPills = await screen.findAllByText(
        (content, element) =>
          element?.textContent?.toLowerCase().includes('selected club: canberra rc') ?? false,
      );
      assert.ok(selectedPills.length > 0);

      await userEvent.click(screen.getByRole('button', { name: /search/i }));

      await screen.findByText(/round 1/i);
      const link = screen.getByRole('link', { name: /view on liverc/i });
      assert.equal(link.getAttribute('href'), 'https://liverc.com/e1');
    },
  );
});

void test('shows no results state and allows clearing the selected club', async () => {
  await withPatchedFetch(
    (input) => {
      const url = toRequestUrl(input);
      if (url.includes('/api/connectors/liverc/clubs/search')) {
        const parsed = new URL(url, 'http://localhost');
        const query = parsed.searchParams.get('q');
        if (query === 'zz') {
          return new Response(JSON.stringify({ data: { clubs: [] }, requestId: 'clubs-empty' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response(
          JSON.stringify({
            data: { clubs: [{ id: 'club-1', name: 'Canberra RC', location: 'ACT' }] },
            requestId: 'clubs',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      throw new Error(`Unexpected fetch to ${url}`);
    },
    async () => {
      render(<LiveRcQuickImport />);

      const club = screen.getByLabelText<HTMLInputElement>(/search for club/i);

      await userEvent.type(club, 'zz');
      await screen.findByText(/no clubs found/i);

      await userEvent.clear(club);
      await userEvent.type(club, 'Can');
      const suggestion = await screen.findByRole('button', { name: /Canberra RC/ });
      await userEvent.click(suggestion);
      const selectedPills = await screen.findAllByText(
        (content, element) =>
          element?.textContent?.toLowerCase().includes('selected club: canberra rc') ?? false,
      );
      assert.ok(selectedPills.length > 0);

      const clearButton = screen.getByRole('button', { name: /clear selected club/i });
      await userEvent.click(clearButton);

      assert.equal(club.value, '');

      await userEvent.type(club, 'Can');
      await screen.findByRole('button', { name: /Canberra RC/ });
    },
  );
});
