import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyUpdate,
  fetchPublishedVersion,
  isDifferentBuild,
  MIN_CHECK_INTERVAL_MS,
  type FetchLike,
} from './updateCheck';
import { UpdateBanner } from './UpdateBanner';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

function stubPublished(body: unknown) {
  const fetchMock = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(body)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchPublishedVersion', () => {
  it('reads version.json past every cache', async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse({ version: '0.4.0', buildId: '0.4.0+abc' })),
    );

    expect(await fetchPublishedVersion(fetchImpl, 123)).toEqual({
      version: '0.4.0',
      buildId: '0.4.0+abc',
    });
    expect(fetchImpl).toHaveBeenCalledWith('./version.json?t=123', { cache: 'no-store' });
  });

  it('reports "unknown" for network errors, HTTP errors and malformed files', async () => {
    expect(await fetchPublishedVersion(() => Promise.reject(new Error('offline')))).toBeNull();
    expect(await fetchPublishedVersion(() => Promise.resolve(jsonResponse({}, false)))).toBeNull();
    expect(
      await fetchPublishedVersion(() => Promise.resolve(jsonResponse({ version: '1' }))),
    ).toBeNull();
    expect(await fetchPublishedVersion(() => Promise.resolve(jsonResponse('<html>')))).toBeNull();
  });
});

describe('isDifferentBuild', () => {
  it('is true only for a known, different build', () => {
    expect(isDifferentBuild('a', { version: '1', buildId: 'b' })).toBe(true);
    expect(isDifferentBuild('a', { version: '1', buildId: 'a' })).toBe(false);
    expect(isDifferentBuild('a', null)).toBe(false);
  });
});

describe('applyUpdate', () => {
  it('refreshes the cached start page, then reloads', async () => {
    const order: string[] = [];
    const fetchImpl = vi.fn<FetchLike>(() => {
      order.push('fetch');
      return Promise.resolve(jsonResponse(null));
    });

    await applyUpdate(fetchImpl, () => order.push('reload'));

    expect(fetchImpl).toHaveBeenCalledWith('./', { cache: 'reload' });
    expect(order).toEqual(['fetch', 'reload']);
  });

  it('reloads even when refreshing the cache fails', async () => {
    const reload = vi.fn();
    await applyUpdate(() => Promise.reject(new Error('offline')), reload);
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe('UpdateBanner', () => {
  it('stays hidden when the published build is the running one', async () => {
    const fetchMock = stubPublished({ version: '0.0.0', buildId: __BUILD_ID__ });
    render(<UpdateBanner />);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays hidden when the version cannot be checked', async () => {
    const fetchMock = vi.fn<FetchLike>(() => Promise.reject(new Error('offline')));
    vi.stubGlobal('fetch', fetchMock);
    render(<UpdateBanner />);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('announces a newer build and can be postponed', async () => {
    const user = userEvent.setup();
    stubPublished({ version: '9.9.9', buildId: 'newer-build' });
    render(<UpdateBanner />);

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('Dostępna jest nowsza wersja aplikacji (9.9.9)');
    expect(banner).toHaveTextContent('Twoje dane zostaną zachowane');
    expect(screen.getByRole('button', { name: 'Odśwież' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Później' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('checks again when the app returns to the foreground, but not more than once a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    const fetchMock = stubPublished({ version: '0.0.0', buildId: __BUILD_ID__ });
    render(<UpdateBanner />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const comeBack = () => act(() => void document.dispatchEvent(new Event('visibilitychange')));

    comeBack();
    expect(fetchMock).toHaveBeenCalledTimes(1); // too soon

    vi.setSystemTime(Date.now() + MIN_CHECK_INTERVAL_MS + 1);
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ version: '1.0.0', buildId: 'published-meanwhile' })),
    );
    comeBack();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('status')).toHaveTextContent('(1.0.0)');
  });
});
