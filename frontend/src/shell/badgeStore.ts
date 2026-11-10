import { create } from 'zustand';
import { BADGE_POLL_MS } from '@note/shared/manifest';
import { request } from '../api/client';

/**
 * Badges on the desktop icons: how much is waiting inside an app that is closed.
 *
 * The shell owns this, not the apps — a desktop may not import a window it hosts,
 * and the number has to be there whether or not that window was ever opened. One
 * small count per app, polled slowly: this is the question "should the icon light
 * up?", not "what did they write?".
 */

interface BadgeSource {
  appId: string;
  /** Endpoint answering `{ total }`. */
  path: string;
}

const SOURCES: BadgeSource[] = [{ appId: 'chat', path: '/chat/unread' }];

interface BadgeStore {
  counts: Record<string, number>;
  refresh: () => Promise<void>;
  clear: () => void;
}

export const useBadges = create<BadgeStore>((set, get) => ({
  counts: {},

  refresh: async () => {
    const answers = await Promise.allSettled(
      SOURCES.map((source) => request<{ total: number }>(source.path)),
    );

    const next = { ...get().counts };
    answers.forEach((answer, index) => {
      // A call that failed says nothing; a badge that blinks out on a hiccup is
      // worse than one that lags a few seconds.
      if (answer.status === 'fulfilled') next[SOURCES[index].appId] = answer.value.total;
    });
    set({ counts: next });
  },

  clear: () => set({ counts: {} }),
}));

/**
 * Ask every few seconds while the tab is in front of the person, immediately when
 * it comes back. Nobody wants the desktop counting messages in a hidden tab.
 *
 * @returns the function that stops it again
 */
export function startBadgePoll(): () => void {
  const { refresh, clear } = useBadges.getState();
  void refresh();

  const tick = window.setInterval(() => {
    if (document.visibilityState === 'visible') void refresh();
  }, BADGE_POLL_MS);

  const onVisibility = () => {
    if (document.visibilityState === 'visible') void refresh();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    window.clearInterval(tick);
    document.removeEventListener('visibilitychange', onVisibility);
    clear();
  };
}

/** How much waits in one app; 0 when nothing does. */
export function badgeCount(counts: Record<string, number>, appId: string): number {
  return counts[appId] ?? 0;
}
