/**
 * The badge poll: the desktop asking, quietly, whether something arrived while no
 * chat window was open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../api/client';
import { badgeCount, startBadgePoll, useBadges } from './badgeStore';
import { BADGE_POLL_MS } from '@note/shared/manifest';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, request: vi.fn() };
});

const api = vi.mocked(request);

/** jsdom reports the tab visible; a test can say otherwise. */
function visible(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
}

beforeEach(() => {
  vi.useFakeTimers();
  useBadges.setState({ counts: {} });
  visible('visible');
});

afterEach(() => {
  vi.useRealTimers();
  visible('visible');
});

describe('counting what waits', () => {
  it('reads the number from the server', async () => {
    api.mockResolvedValue({ total: 4 });

    await useBadges.getState().refresh();

    expect(api).toHaveBeenCalledWith('/chat/unread');
    expect(badgeCount(useBadges.getState().counts, 'chat')).toBe(4);
    expect(badgeCount(useBadges.getState().counts, 'notepad')).toBe(0);
  });

  it('keeps the last number when the server does not answer', async () => {
    api.mockResolvedValue({ total: 2 });
    await useBadges.getState().refresh();

    api.mockRejectedValue(new Error('502'));
    await useBadges.getState().refresh();

    expect(badgeCount(useBadges.getState().counts, 'chat')).toBe(2);
  });

  it('says nothing about an app nobody counts for', () => {
    expect(badgeCount({}, 'chat')).toBe(0);
  });
});

describe('the poll', () => {
  it('asks right away and then every few seconds', async () => {
    api.mockResolvedValue({ total: 1 });
    const stop = startBadgePoll();
    await Promise.resolve();

    expect(api).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(BADGE_POLL_MS * 2);

    expect(api).toHaveBeenCalledTimes(3);
    stop();
  });

  it('does not count messages in a tab nobody is looking at', async () => {
    api.mockResolvedValue({ total: 1 });
    const stop = startBadgePoll();
    await Promise.resolve();

    visible('hidden');
    await vi.advanceTimersByTimeAsync(BADGE_POLL_MS * 2);

    expect(api).toHaveBeenCalledTimes(1);
    stop();
  });

  it('asks again the moment the tab comes back, and forgets on stop', async () => {
    api.mockResolvedValue({ total: 5 });
    const stop = startBadgePoll();
    await Promise.resolve();

    visible('hidden');
    visible('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(api).toHaveBeenCalledTimes(2);

    stop();
    expect(useBadges.getState().counts).toEqual({});

    await vi.advanceTimersByTimeAsync(BADGE_POLL_MS * 3);
    expect(api).toHaveBeenCalledTimes(2);
  });
});
