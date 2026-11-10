import { useEffect } from 'react';
import { useDesktop } from './desktopStore';
import { usePhone } from './viewport';
import { IconGrid } from './IconGrid';
import { openDesktopItem, openFolder } from './openApp';
import { useWindows } from './windowStore';
import type { AppProps } from './registry';
import styles from './FolderView.module.css';

/**
 * Built-in view for a desktop folder.
 *
 * A folder is not an application: it has no state of its own beyond the items it
 * contains, so it is rendered by the shell and registered as a built-in view.
 */
export function FolderView({ windowKey, payload }: AppProps) {
  const folderId = Number(payload.folderId);
  const items = useDesktop((state) => state.items);
  const phone = usePhone();
  const setTitle = useWindows((state) => state.setTitle);

  const folder = items.find((item) => item.id === folderId);

  // Renaming the folder renames the window showing it.
  useEffect(() => {
    if (folder) setTitle(windowKey, folder.name);
  }, [folder, windowKey, setTitle]);

  if (!folder) {
    return <p className={styles.missing}>Ten folder został usunięty.</p>;
  }

  return (
    <div className={styles.wrap}>
      <IconGrid
        parentId={folderId}
        items={items}
        minRows={3}
        // Na telefonie zapisane komórki są bez znaczenia (patrz pulpit), a otwiera
        // jedno tapnięcie — folder zachowuje się jak ekran, nie jak biurko.
        flow={phone}
        onOpen={(item) => (item.kind === 'folder' ? openFolder(item) : openDesktopItem(item))}
      />
    </div>
  );
}
