import type { ComponentType } from 'react';
import { appById } from '@note/shared/manifest';
import {
  CalculatorIcon,
  FilesIcon,
  FolderIcon,
  NotepadIcon,
  StickiesIcon,
  UnknownAppIcon,
} from './icons';
import { CalculatorApp } from '../apps/calculator/CalculatorApp';
import { FilesApp } from '../apps/files/FilesApp';
import { NotepadApp } from '../apps/notepad/NotepadApp';
import { StickiesApp } from '../apps/stickies/StickiesApp';
import { FolderView } from './FolderView';

/**
 * Application registry — the only coupling point between the desktop shell and
 * the apps it hosts.
 *
 * The shell imports this module, never an app directly. Adding an app means one
 * manifest entry in @note/shared plus one entry in APP_VIEWS; deleting one means
 * removing them again, and any leftover desktop icon degrades to MissingView
 * instead of blank-screening.
 */

export interface AppProps {
  windowKey: string;
  /** App id, so a view (or the fallback) can report what it was asked to show. */
  appId: string;
  payload: Record<string, unknown>;
}

const APP_VIEWS: Record<string, ComponentType<AppProps>> = {
  calculator: CalculatorApp,
  files: FilesApp,
  notepad: NotepadApp,
  stickies: StickiesApp,
};

/** Shell-owned views that are not installable apps. */
const BUILT_IN_VIEWS: Record<string, ComponentType<AppProps>> = {
  folder: FolderView,
};

export function resolveView(appId: string): ComponentType<AppProps> {
  return APP_VIEWS[appId] ?? BUILT_IN_VIEWS[appId] ?? MissingView;
}

export function isRegistered(appId: string): boolean {
  return appById(appId) !== null;
}

export function appTitle(appId: string): string {
  return appById(appId)?.title ?? appId;
}

/** Icon for an app id, with a safe fallback for unknown ones. */
export function AppGlyph({ appId, size = 48 }: { appId: string; size?: number }) {
  switch (appId) {
    case 'calculator':
      return <CalculatorIcon size={size} />;
    case 'notepad':
      return <NotepadIcon size={size} />;
    case 'stickies':
      return <StickiesIcon size={size} />;
    case 'files':
      return <FilesIcon size={size} />;
    case 'folder':
      return <FolderIcon size={size} />;
    default:
      return <UnknownAppIcon size={size} />;
  }
}

function MissingView({ appId }: AppProps) {
  return (
    <div style={{ padding: 24, color: '#c9d2e3' }}>
      <p>Ta aplikacja nie jest już zainstalowana.</p>
      <p>
        Ikona wskazuje na <code>{appId}</code> — usuń ją z pulpitu albo przywróć aplikację.
      </p>
    </div>
  );
}
