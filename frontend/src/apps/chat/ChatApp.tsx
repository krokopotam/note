import { useEffect, useRef, useState } from 'react';
import { CHAT_ATTACHMENTS_PER_MESSAGE, CHAT_POLL_MS, MESSAGE_EDIT_MINUTES, MESSAGE_MAX_LENGTH } from '@note/shared/manifest';
import { formatCountdown, formatStamp } from '../../shared/format';
import { RowMenu } from '../../shared/RowMenu';
import { attachmentUrl } from './chatApi';
import { EmojiPicker } from './EmojiPicker';
import { useChat } from './chatStore';
import { insertAtCaret } from './emoji';
import { avatarHue, avatarInitial, startsGroup } from './chatView';
import type { Conversation, Message } from '../../api/types';
import type { AppProps } from '../../shell/registry';
import styles from './ChatApp.module.css';

/** Below this width the list of conversations folds behind a button. */
const NARROW_QUERY = '(max-width: 620px)';

/**
 * Chat: conversations with other accounts, and the five minutes in which what you
 * wrote can still be fixed.
 *
 * New messages arrive by polling while the window is open — the app has no
 * background processes, and a window nobody is looking at has nothing to fetch.
 */
export function ChatApp(_props: AppProps) {
  const state = useChat();
  const active = state.conversations.find((conversation) => conversation.id === state.activeId) ?? null;
  const thread = useRef<HTMLDivElement>(null);
  const narrow = useNarrow();
  const [sideOpen, setSideOpen] = useState(false);
  /** Picture clicked in a bubble: shown big, in this window rather than a new tab. */
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoom(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoom]);

  useEffect(() => {
    void useChat.getState().load();
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void useChat.getState().refresh();
    }, CHAT_POLL_MS);
    return () => window.clearInterval(tick);
  }, []);

  // A thread should always show its latest line.
  useEffect(() => {
    const box = thread.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [state.messages.length, state.activeId]);

  const openConversation = async (id: number) => {
    await useChat.getState().open(id);
    // On a narrow window the list is an overlay: opening a thread should clear it.
    if (narrow) setSideOpen(false);
  };

  return (
    <div className={styles.app} data-side={sideOpen ? 'open' : 'closed'} data-testid="chat">
      <nav className={styles.side} aria-label="Rozmowy">
        <ul className={styles.list}>
          {state.conversations.map((conversation) => (
            <li key={conversation.id}>
              <ConversationRow conversation={conversation} onOpen={() => void openConversation(conversation.id)} />
            </li>
          ))}
          {state.conversations.length === 0 && (
            <li className={styles.empty}>
              {state.status === 'loading' ? 'Wczytuję…' : 'Nie masz jeszcze rozmów.'}
            </li>
          )}
        </ul>
        <button type="button" className={styles.newChat} onClick={() => void state.openNewChat()}>
          Nowy czat
        </button>
      </nav>

      <section className={styles.main}>
        {state.newChatOpen && <NewChat />}
        {state.addMemberOpen && <AddMember />}

        {active === null ? (
          <p className={styles.empty}>
            Wybierz rozmowę po lewej albo napisz do kogoś nowego.
          </p>
        ) : (
          <>
            <header className={styles.head}>
              <button
                type="button"
                className={styles.sideToggle}
                aria-label="Rozmowy"
                aria-expanded={sideOpen}
                onClick={() => setSideOpen((open) => !open)}
              >
                Rozmowy
              </button>
              <Avatar name={active.title} size={30} />
              <div className={styles.headText}>
                <h2 className={styles.title}>{active.title}</h2>
                {active.is_group && (
                  <span className={styles.sub}>{state.members.map((member) => member.username).join(', ')}</span>
                )}
              </div>
              {active.is_group && (
                <button
                  type="button"
                  className={styles.addMember}
                  onClick={() => void state.openAddMember()}
                >
                  Dodaj osobę
                </button>
              )}
            </header>

            <div className={styles.thread} ref={thread} data-testid="thread">
              {state.messages.map((message, index) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  grouped={!startsGroup(state.messages[index - 1], message)}
                  onZoom={setZoom}
                />
              ))}
              {state.messages.length === 0 && (
                <p className={styles.empty}>
                  Napisz pierwszą wiadomość — zmienić ją możesz przez {MESSAGE_EDIT_MINUTES} minut.
                </p>
              )}
            </div>

            <Composer conversation={active} />
          </>
        )}

        {state.error && <p className={styles.error}>{state.error}</p>}
      </section>

      {zoom && (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-label={zoom.name}
          data-testid="lightbox"
          onClick={() => setZoom(null)}
        >
          <img className={styles.lightImage} src={zoom.url} alt={zoom.name} />
          <button type="button" className={styles.lightClose} onClick={() => setZoom(null)}>
            Zamknij
          </button>
        </div>
      )}
    </div>
  );
}

/** Circle with the first letter of a nickname, coloured from the nickname itself. */
function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <span
      className={styles.avatar}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.44),
        background: `hsl(${avatarHue(name)} 46% 42%)`,
      }}
    >
      {avatarInitial(name)}
    </span>
  );
}

function ConversationRow({
  conversation,
  onOpen,
}: {
  conversation: Conversation;
  onOpen: () => void;
}) {
  const activeId = useChat((state) => state.activeId);
  const on = conversation.id === activeId;
  return (
    <button
      type="button"
      className={on ? styles.rowOn : styles.row}
      aria-current={on}
      onClick={onOpen}
      data-testid={`conversation-${conversation.id}`}
    >
      <Avatar name={conversation.title} />
      <span className={styles.rowText}>
        <span className={styles.rowTop}>
          <span className={styles.peer}>{conversation.title}</span>
          {conversation.last_at && <span className={styles.stamp}>{formatStamp(conversation.last_at)}</span>}
        </span>
        <span className={styles.rowBottom}>
          <span className={styles.preview}>
            {conversation.last_body === null
              ? 'bez wiadomości'
              : conversation.last_deleted
                ? 'wiadomość usunięta'
                : `${conversation.last_from_me ? 'ty: ' : ''}${conversation.last_body}`}
          </span>
          {conversation.unread > 0 && (
            <span className={styles.badge} aria-label={`${conversation.unread} nieprzeczytanych`}>
              {conversation.unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/**
 * Start a conversation: tick one person for a plain 1:1 thread, tick two or more
 * (or give it a name) and it becomes a group that can grow later.
 */
function NewChat() {
  const people = useChat((state) => state.people);
  const start = useChat((state) => state.start);
  const createGroup = useChat((state) => state.createGroup);
  const close = useChat((state) => state.closeNewChat);
  const [filter, setFilter] = useState('');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<number[]>([]);

  const shown = people.filter((person) =>
    person.username.includes(filter.trim().toLowerCase()),
  );

  const toggle = (id: number) =>
    setPicked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  // One person, no name: that is the pair thread, with all its "only one ever" rule.
  const submit = () => {
    if (picked.length === 0) return;
    if (picked.length === 1 && title.trim() === '') void start(picked[0]);
    else void createGroup(title, picked);
  };

  return (
    <div className={styles.newPanel} data-testid="new-chat">
      <div className={styles.newHead}>
        <strong>Nowa rozmowa</strong>
        <button type="button" onClick={close}>
          Zamknij
        </button>
      </div>
      <input
        className={styles.filter}
        type="search"
        placeholder="Szukaj osoby…"
        aria-label="Szukaj osoby"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <ul className={styles.people}>
        {shown.map((person) => (
          <li key={person.id} className={styles.person}>
            <label className={styles.pick}>
              <input
                type="checkbox"
                checked={picked.includes(person.id)}
                onChange={() => toggle(person.id)}
                aria-label={`Wybierz ${person.username}`}
              />
              <Avatar name={person.username} size={22} />
              <span className={styles.personName}>{person.username}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className={styles.empty}>Nie ma takiej osoby.</li>}
      </ul>
      <input
        className={styles.titleInput}
        type="text"
        placeholder="Nazwa rozmowy (opcjonalnie)"
        aria-label="Nazwa rozmowy"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button
        type="button"
        className={styles.create}
        disabled={picked.length === 0}
        onClick={submit}
      >
        {picked.length > 1 ? 'Utwórz grupę' : 'Utwórz rozmowę'}
      </button>
    </div>
  );
}

/** Who else can join this group. Everybody already in it is not offered twice. */
function AddMember() {
  const people = useChat((state) => state.people);
  const members = useChat((state) => state.members);
  const add = useChat((state) => state.addMember);
  const close = useChat((state) => state.closeAddMember);

  const shown = people.filter((person) => !members.some((member) => member.id === person.id));

  return (
    <div className={styles.newPanel} data-testid="add-member">
      <div className={styles.newHead}>
        <strong>Dopisz osobę</strong>
        <button type="button" onClick={close}>
          Zamknij
        </button>
      </div>
      <ul className={styles.people}>
        {shown.map((person) => (
          <li key={person.id} className={styles.person}>
            <Avatar name={person.username} size={22} />
            <span className={styles.personName}>{person.username}</span>
            <button type="button" aria-label={`Dodaj ${person.username}`} onClick={() => void add(person.id)}>
              Dodaj
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className={styles.empty}>Wszyscy są już w środku.</li>}
      </ul>
    </div>
  );
}

/**
 * One message: avatar, and — only when this is the first one in a row from the
 * same person — the name and the hour above the bubble.
 */
function MessageRow({
  message,
  grouped,
  onZoom,
}: {
  message: Message;
  grouped: boolean;
  onZoom: (picture: { url: string; name: string }) => void;
}) {
  const edit = useChat((state) => state.edit);
  const remove = useChat((state) => state.remove);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(message.body);
  const field = useRef<HTMLTextAreaElement>(null);
  // The window is the server's; this clock only decides when to hide the buttons.
  const [now, setNow] = useState(() => Date.now());

  const stillOpen =
    message.can_edit && message.editable_until !== null && Date.parse(message.editable_until) > now;

  useEffect(() => {
    if (!message.can_edit) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [message.can_edit]);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  const save = async () => {
    setEditing(false);
    if (text.trim() && text.trim() !== message.body) await edit(message.id, text);
  };

  const classes = [
    styles.message,
    message.from_me ? styles.me : styles.them,
    grouped ? styles.grouped : styles.groupStart,
    message.author_id === null ? styles.gone : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={classes}
      data-me={message.from_me || undefined}
      data-testid={`message-${message.id}`}
    >
      <span className={styles.gutter}>{!grouped && <Avatar name={message.author_name} />}</span>

      <div className={styles.stack}>
        {!grouped && (
          <header className={styles.meta}>
            <strong className={styles.author}>{message.from_me ? 'Ty' : message.author_name}</strong>
            <span className={styles.stamp}>{formatStamp(message.created_at)}</span>
            {message.edited_at && <span className={styles.edited}>edytowane</span>}
          </header>
        )}

        {!message.deleted && message.attachments.length > 0 && (
          <span className={styles.pictures}>
            {message.attachments.map((attachment) => (
              <button
                key={attachment.id}
                type="button"
                className={styles.thumbButton}
                aria-label={`Powiększ ${attachment.file_name}`}
                onClick={() => onZoom({ url: attachmentUrl(attachment.id), name: attachment.file_name })}
              >
                <img
                  className={styles.thumb}
                  src={attachmentUrl(attachment.id)}
                  alt={attachment.file_name}
                  loading="lazy"
                />
              </button>
            ))}
          </span>
        )}

        {editing ? (
          <div className={styles.editForm}>
            <textarea
              ref={field}
              className={styles.editBox}
              value={text}
              aria-label={`Treść wiadomości ${message.id}`}
              maxLength={MESSAGE_MAX_LENGTH}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setEditing(false);
                  setText(message.body);
                }
              }}
            />
            <span className={styles.editActions}>
              <button type="button" onClick={() => void save()}>
                Zapisz
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setText(message.body);
                }}
              >
                Anuluj
              </button>
            </span>
          </div>
        ) : message.deleted ? (
          <p className={`${styles.bubble} ${styles.tomb}`}>
            {grouped && <span className={styles.srOnly}>{message.author_name}</span>}
            wiadomość usunięta
          </p>
        ) : message.body === '' ? null : (
          <p className={styles.bubble} title={formatStamp(message.created_at)}>
            {grouped && <span className={styles.srOnly}>{message.author_name}</span>}
            {message.body}
          </p>
        )}
      </div>

      {stillOpen && !editing && (
        <span className={styles.tools}>
          <span className={styles.left}>{formatCountdown(Date.parse(message.editable_until!) - now)}</span>
          <RowMenu
            label={`Czynności wiadomości ${message.id}`}
            items={[
              {
                label: 'Popraw',
                onSelect: () => {
                  setText(message.body);
                  setEditing(true);
                },
              },
              { label: 'Usuń', onSelect: () => void remove(message.id), danger: true },
            ]}
          />
        </span>
      )}
    </article>
  );
}

function Composer({ conversation }: { conversation: Conversation }) {
  const send = useChat((state) => state.send);
  const sending = useChat((state) => state.sending);
  const [draft, setDraft] = useState('');
  const [pictures, setPictures] = useState<File[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The field grows with what is typed, up to a few lines, then scrolls.
  useEffect(() => {
    const box = input.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }, [draft]);

  /** An emoji goes where the caret was, and the caret stays behind it. */
  const putEmoji = (emoji: string) => {
    const box = input.current;
    const caret = box
      ? { start: box.selectionStart, end: box.selectionEnd }
      : { start: draft.length, end: draft.length };
    const next = insertAtCaret(draft, caret, emoji);
    setDraft(next.text);
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(next.caret, next.caret);
    });
  };

  const addPictures = (files: FileList | null) => {
    if (!files) return;
    const picked = [...files].filter((file) => file.type.startsWith('image/'));
    setPictures((current) => [...current, ...picked].slice(0, CHAT_ATTACHMENTS_PER_MESSAGE));
  };

  const submit = async () => {
    const ok = await send(draft, pictures);
    // Only a delivered message empties the field; a failed one keeps text and pictures.
    if (ok) {
      setDraft('');
      setPictures([]);
      setEmojiOpen(false);
    }
  };

  return (
    <div className={styles.writing}>
      {emojiOpen && <EmojiPicker onPick={putEmoji} onClose={() => setEmojiOpen(false)} />}

      {pictures.length > 0 && (
        <ul className={styles.pending} data-testid="pending-pictures">
          {pictures.map((file, index) => (
            <li key={`${file.name}-${index}`} className={styles.pendingItem}>
              <img className={styles.pendingThumb} src={previewUrl(file)} alt={file.name} />
              <button
                type="button"
                aria-label={`Usuń ${file.name}`}
                onClick={() => setPictures((current) => current.filter((_, position) => position !== index))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <button
          type="button"
          className={styles.tool}
          aria-label="Wstaw emotikonkę"
          aria-expanded={emojiOpen}
          onClick={() => setEmojiOpen((open) => !open)}
        >
          <SmileyIcon />
        </button>
        <button
          type="button"
          className={styles.tool}
          aria-label="Dodaj zdjęcie"
          onClick={() => fileInput.current?.click()}
        >
          <ClipIcon />
        </button>
        <input
          ref={fileInput}
          className={styles.fileInput}
          type="file"
          accept="image/*"
          multiple
          aria-label="Wybierz zdjęcie"
          onChange={(event) => {
            addPictures(event.target.files);
            event.target.value = '';
          }}
        />

        <div className={styles.pill}>
          <textarea
            ref={input}
            className={styles.input}
            value={draft}
            aria-label="Treść wiadomości"
            placeholder={`Napisz wiadomość do ${conversation.title}…`}
            maxLength={MESSAGE_MAX_LENGTH}
            rows={1}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter is a new line — the way people expect.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {draft.length > MESSAGE_MAX_LENGTH * 0.8 && (
            <span className={styles.counter}>
              {draft.length}/{MESSAGE_MAX_LENGTH}
            </span>
          )}
        </div>
        <button
          type="submit"
          className={styles.send}
          aria-label="Wyślij"
          disabled={sending || (draft.trim() === '' && pictures.length === 0)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12.6 2-12.6 2 .1 6.4Z" />
          </svg>
        </button>
      </form>
    </div>
  );
}

/** Thumbnails are made from the picked file; without the API (jsdom) they are just names. */
function previewUrl(file: File): string {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
}

function SmileyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-3.5-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12 17.5c2.1 0 3.9-1.2 4.7-3H7.3c.8 1.8 2.6 3 4.7 3Z"
      />
    </svg>
  );
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.5 6.6v8.9a4.5 4.5 0 0 1-9 0V6.4a3 3 0 0 1 6 0v8.2a1.5 1.5 0 0 1-3 0V7.6H9v7a3 3 0 0 0 6 0V6.4a4.5 4.5 0 0 0-9 0v9.1a6 6 0 0 0 12 0V6.6h-1.5Z"
      />
    </svg>
  );
}

/**
 * Is the window too thin for two columns? jsdom has no matchMedia at all, so the
 * answer there is simply "no".
 */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => matchesNarrow());

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(NARROW_QUERY);
    if (typeof query.addEventListener !== 'function') return undefined;

    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches);
    setNarrow(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return narrow;
}

function matchesNarrow(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;
}
