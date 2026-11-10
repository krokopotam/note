import { useEffect, useRef, useState } from 'react';
import { MAX_UPLOAD_MB } from '@note/shared/manifest';
import { formatSize, formatStamp } from '../../shared/format';
import { RowMenu } from '../../shared/RowMenu';
import { downloadUrl } from './filesApi';
import { useFiles } from './filesStore';
import type { FileEntry, FileResource } from '../../api/types';
import type { AppProps } from '../../shell/registry';
import styles from './FilesApp.module.css';

/**
 * Files: upload anything into a resource, hand it to other accounts, take it back.
 *
 * Everything the UI may do is decided by the `role` the server sent with the
 * resource — a read-only friend simply does not get the upload or delete buttons,
 * rather than getting them and an error on click.
 */

const ROLE_LABEL: Record<FileResource['role'], string> = {
  owner: 'własny',
  edit: 'współdzielony — edycja',
  read: 'współdzielony — tylko odczyt',
};

export function FilesApp(_props: AppProps) {
  const state = useFiles();
  const active = state.resources.find((resource) => resource.id === state.activeId) ?? null;
  const canEdit = active !== null && active.role !== 'read';

  useEffect(() => {
    void useFiles.getState().load();
    // The list loads once per window; store changes must not trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.app} data-testid="files">
      <nav className={styles.side} aria-label="Zasoby">
        <ResourceList />
      </nav>

      <section
        data-testid="files-main"
        className={styles.main}
        onDragOver={(event) => {
          event.preventDefault();
          event.currentTarget.dataset.dragging = 'true';
        }}
        onDragLeave={(event) => delete event.currentTarget.dataset.dragging}
        onDrop={(event) => {
          event.preventDefault();
          delete event.currentTarget.dataset.dragging;
          void send(event.dataTransfer?.files);
        }}
      >
        {active === null ? (
          <p className={styles.empty}>
            {state.status === 'loading'
              ? 'Wczytuję…'
              : 'Nie masz jeszcze żadnego zasobu. Dodaj go pod listą zasobów — pliki wrzuca się do środka.'}
          </p>
        ) : (
          <>
            <header className={styles.head}>
              <h2 className={styles.title}>{active.name}</h2>
              <span className={styles.role}>{ROLE_LABEL[active.role]}</span>
            </header>

            {state.sharingOpen && <Sharing resource={active} />}

            {state.members.length > 0 && !state.sharingOpen && (
              <p className={styles.sharedNote}>
                Udostępniony: {state.members.map((m) => `${m.username} (${m.permission})`).join(', ')}
              </p>
            )}

            {canEdit ? (
              <label className={styles.dropzone} data-testid="dropzone">
                <input
                  className={styles.fileInput}
                  type="file"
                  multiple
                  aria-label="Wybierz pliki do wysłania"
                  onChange={(event) => {
                    void send(event.target.files);
                    event.target.value = '';
                  }}
                />
                <strong>Przeciągnij pliki tutaj</strong>
                <span>albo dotknij, żeby wybrać z dysku · do {MAX_UPLOAD_MB} MB na plik</span>
              </label>
            ) : (
              <p className={styles.readOnly}>Ten zasób jest tylko do odczytu — możesz pobierać pliki.</p>
            )}

            <ul className={styles.uploads} aria-label="Wysyłanie plików">
              {state.uploads.map((upload) => (
                <li key={upload.key} className={styles.upload}>
                  <span className={styles.uploadName}>{upload.name}</span>
                  {upload.error ? (
                    <span className={styles.uploadError}>{upload.error}</span>
                  ) : (
                    <span
                      className={styles.bar}
                      role="progressbar"
                      aria-valuenow={Math.round(upload.progress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span className={styles.barFill} style={{ width: `${upload.progress * 100}%` }} />
                    </span>
                  )}
                  <button type="button" onClick={() => state.dismissUpload(upload.key)}>
                    {upload.error ? 'Zamknij' : 'Anuluj widok'}
                  </button>
                </li>
              ))}
            </ul>

            <input
              className={styles.search}
              type="search"
              placeholder="Szukaj w tym zasobie…"
              aria-label="Szukaj plików"
              value={state.query}
              onChange={(event) => void state.searchFiles(event.target.value)}
            />

            {state.filesError && <p className={styles.error}>{state.filesError}</p>}

            <ul className={styles.list}>
              {state.files.map((file) => (
                <FileRow key={file.id} file={file} canEdit={canEdit} />
              ))}
              {state.files.length === 0 && !state.filesError && (
                <li className={styles.empty}>
                  {state.query ? `Nic nie pasuje do „${state.query}”.` : 'W zasobie nie ma plików.'}
                </li>
              )}
            </ul>
          </>
        )}

        {state.error && <p className={styles.error}>{state.error}</p>}
      </section>
    </div>
  );
}

function ResourceList() {
  const resources = useFiles((state) => state.resources);
  const activeId = useFiles((state) => state.activeId);
  const select = useFiles((state) => state.select);
  const create = useFiles((state) => state.createResource);
  const rename = useFiles((state) => state.renameResource);
  const removeResource = useFiles((state) => state.removeResource);
  const openSharing = useFiles((state) => state.openSharing);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId !== null) field.current?.focus();
  }, [renamingId]);

  // The sharing panel belongs to the open resource, so pick it first.
  const share = async (id: number) => {
    if (activeId !== id) await select(id);
    await openSharing();
  };

  return (
    <>
      <ul className={styles.resourceList}>
        {resources.map((resource) => (
          <li key={resource.id} className={styles.resourceRow}>
            {renamingId === resource.id ? (
              <form
                className={styles.renameRow}
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = field.current?.value.trim() ?? '';
                  setRenamingId(null);
                  if (value && value !== resource.name) void rename(resource.id, value);
                }}
              >
                <input
                  ref={field}
                  className={styles.renameField}
                  type="text"
                  aria-label={`Nowa nazwa zasobu ${resource.name}`}
                  defaultValue={resource.name}
                  maxLength={80}
                  onBlur={() => setRenamingId(null)}
                />
                <button type="submit">Zapisz</button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  data-testid={`resource-${resource.id}`}
                  className={resource.id === activeId ? styles.resourceOn : styles.resource}
                  aria-current={resource.id === activeId}
                  onClick={() => void select(resource.id)}
                >
                  <span className={styles.resourceName}>{resource.name}</span>
                  <span className={styles.resourceCount}>{resource.file_count}</span>
                  {resource.role !== 'owner' && <span className={styles.sharedMark}>od</span>}
                </button>
                {resource.role === 'owner' && (
                  <RowMenu
                    label={`Czynności zasobu ${resource.name}`}
                    items={[
                      { label: 'Zmień nazwę', onSelect: () => setRenamingId(resource.id) },
                      { label: 'Udostępnij', onSelect: () => void share(resource.id) },
                      {
                        label: 'Usuń zasób',
                        onSelect: () => void removeResource(resource.id),
                        danger: true,
                      },
                    ]}
                  />
                )}
              </>
            )}
          </li>
        ))}
        {resources.length === 0 && <li className={styles.empty}>Brak zasobów.</li>}
      </ul>
      <form
        className={styles.createForm}
        onSubmit={(event) => {
          event.preventDefault();
          const field = event.currentTarget.elements.namedItem('name') as HTMLInputElement;
          const name = field.value.trim();
          if (!name) return;
          field.value = '';
          void create(name);
        }}
      >
        <input
          name="name"
          className={styles.createInput}
          type="text"
          placeholder="Nazwa nowego zasobu"
          aria-label="Nazwa nowego zasobu"
          maxLength={80}
        />
        <button type="submit" className={styles.createButton}>
          Dodaj zasób
        </button>
      </form>
    </>
  );
}

/** Owner only: pick a person, pick what they may do. */
function Sharing({ resource }: { resource: FileResource }) {
  const members = useFiles((state) => state.members);
  const people = useFiles((state) => state.people);
  const setPermission = useFiles((state) => state.setPermission);
  const close = useFiles((state) => state.closeSharing);

  const permissionFor = (userId: number) =>
    members.find((member) => member.user_id === userId)?.permission ?? null;

  return (
    <div className={styles.sharing} data-testid="sharing">
      <div className={styles.sharingHead}>
        <strong>Udostępnianie zasobu „{resource.name}”</strong>
        <button type="button" onClick={close}>
          Zamknij
        </button>
      </div>
      <ul className={styles.people}>
        {people.map((person) => (
          <li key={person.id} className={styles.person}>
            <span className={styles.personName}>{person.username}</span>
            <select
              aria-label={`Dostęp dla ${person.username}`}
              value={permissionFor(person.id) ?? ''}
              onChange={(event) =>
                void setPermission(
                  person.id,
                  event.target.value === '' ? null : (event.target.value as 'read' | 'edit'),
                )
              }
            >
              <option value="">brak</option>
              <option value="read">odczyt</option>
              <option value="edit">edycja</option>
            </select>
          </li>
        ))}
        {people.length === 0 && <li className={styles.empty}>Nie ma komu udostępniać.</li>}
      </ul>
    </div>
  );
}

function FileRow({ file, canEdit }: { file: FileEntry; canEdit: boolean }) {
  const rename = useFiles((state) => state.renameFile);
  const remove = useFiles((state) => state.removeFile);
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  return (
    <li className={styles.file} data-testid={`file-${file.id}`}>
      <a className={styles.fileName} href={downloadUrl(file.id)} download={file.name}>
        {file.name}
      </a>
      <span className={styles.fileMeta}>{formatSize(file.size)}</span>
      <span className={styles.fileMeta}>
        {file.created_by_name} · {formatStamp(file.created_at)}
      </span>

      {canEdit && editing && (
        <form
          className={styles.inlineForm}
          onSubmit={(event) => {
            event.preventDefault();
            const value = field.current?.value.trim() ?? '';
            setEditing(false);
            if (value && value !== file.name) void rename(file.id, value);
          }}
        >
          <input
            ref={field}
            className={styles.inlineInput}
            type="text"
            aria-label={`Nowa nazwa pliku ${file.name}`}
            defaultValue={file.name}
            maxLength={200}
            onBlur={() => setEditing(false)}
          />
          <button type="submit">Zapisz</button>
        </form>
      )}
      {canEdit && !editing && (
        <RowMenu
          label={`Czynności pliku ${file.name}`}
          items={[
            { label: 'Zmień nazwę', onSelect: () => setEditing(true) },
            { label: 'Usuń', onSelect: () => void remove(file.id), danger: true },
          ]}
        />
      )}
    </li>
  );
}

/** Uploads are independent, so a big one never blocks the file picked after it. */
async function send(files: FileList | undefined | null): Promise<void> {
  if (!files || files.length === 0) return;
  const upload = useFiles.getState().upload;
  const limit = MAX_UPLOAD_MB * 1024 * 1024;

  for (const file of Array.from(files)) {
    if (file.size > limit) {
      // Told before the bytes travel: nginx would refuse it anyway, less politely.
      useFiles.setState((state) => ({
        uploads: [
          ...state.uploads,
          {
            key: `too-big-${Date.now()}-${file.name}`,
            name: file.name,
            progress: 0,
            error: `plik większy niż ${MAX_UPLOAD_MB} MB`,
          },
        ],
      }));
      continue;
    }
    void upload(file);
  }
}
