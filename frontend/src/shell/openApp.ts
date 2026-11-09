import { appById } from '@note/shared/manifest';
import type { DesktopItem } from '../api/types';
import { useWindows } from './windowStore';

/**
 * The one way anything is launched.
 *
 * Window size comes from the app manifest, so an app never dictates its own
 * chrome and the shell stays the single place geometry is decided.
 */
export function openApp(
  appId: string,
  options: { key?: string; title?: string; payload?: Record<string, unknown> } = {},
): string {
  const app = appById(appId);
  return useWindows.getState().open({
    key: options.key ?? appId,
    appId,
    title: options.title ?? app?.title ?? appId,
    width: app?.width ?? 640,
    height: app?.height ?? 480,
    payload: options.payload ?? {},
  });
}

/** Open whatever a desktop icon points at: an app shortcut or another folder. */
export function openDesktopItem(item: DesktopItem): string | null {
  if (item.kind === 'folder') return openFolder(item);
  if (!item.app_id) return null;
  return openApp(item.app_id, { title: item.name });
}

/**
 * Open a desktop folder.
 *
 * The window key carries the folder id, which is what lets several folders be
 * open at once while ordinary apps stay singletons.
 */
export function openFolder(item: DesktopItem): string {
  return openApp('folder', {
    key: `folder:${item.id}`,
    title: item.name,
    payload: { folderId: item.id },
  });
}
