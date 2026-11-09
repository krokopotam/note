import { APPS } from '@note/shared/manifest';
import { request } from '../api/client';
import type { DesktopItem, Note, Sticky } from '../api/types';
import { useDesktop } from './desktopStore';
import { IconGrid } from './IconGrid';
import { openApp, openDesktopItem } from './openApp';
import { useContextMenu } from './contextMenuStore';
import styles from './Desktop.module.css';

/**
 * The desktop: the whole environment.
 *
 * There is no filesystem browser and no path anywhere in this app — the only way
 * into anything is an icon on this grid or a folder that holds icons, which is
 * exactly what the desktop items table stores.
 */
export function Desktop() {
  const items = useDesktop((state) => state.items);
  const createFolder = useDesktop((state) => state.createFolder);
  const openMenu = useContextMenu((state) => state.open);
  const closeMenu = useContextMenu((state) => state.close);

  const newNote = async () => {
    const note = await request<Note>('/notes', { method: 'POST', body: { body: '' } });
    openApp('notepad', { payload: { noteId: note.id } });
  };

  const newSticky = async () => {
    const created = await request<Sticky>('/stickies', { method: 'POST', body: { body: '' } });
    // The id travels in the payload so an already open board jumps to the new card.
    openApp('stickies', { payload: { stickyId: created.id } });
  };

  const onContextMenu = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('[data-testid^="icon-"]')) return;
    event.preventDefault();
    openMenu(event.clientX, event.clientY, [
      { id: 'folder', label: 'Nowy folder', run: () => void createFolder() },
      { id: 'note', label: 'Nowa notatka', run: () => void newNote() },
      { id: 'sticky', label: 'Nowa karteczka', run: () => void newSticky() },
    ]);
  };

  const showAll = () => {
    openMenu(window.innerWidth / 2, 48, APPS.map((app) => ({
      id: app.id,
      label: app.title,
      run: () => openApp(app.id),
    })));
  };

  return (
    <div
      className={styles.desktop}
      onContextMenu={onContextMenu}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeMenu();
      }}
      data-testid="desktop"
    >
      <IconGrid parentId={null} items={items} minRows={7} onOpen={(item: DesktopItem) => openDesktopItem(item)} />
      {items.length === 0 && (
        <div className={styles.empty}>
          <p>Pulpit jest pusty.</p>
          <button type="button" onClick={showAll}>
            Zainstaluj skrót do aplikacji
          </button>
        </div>
      )}
    </div>
  );
}
