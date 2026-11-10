import { useEffect, useRef, useState } from 'react';
import { CHAT_POLL_MS, MESSAGE_EDIT_MINUTES, MESSAGE_MAX_LENGTH } from '@note/shared/manifest';
import { formatCountdown, formatStamp } from '../../shared/format';
import { RowMenu } from '../../shared/RowMenu';
import { useChat } from './chatStore';
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
              <Avatar name={active.peer?.username ?? '?'} size={30} />
              <h2 className={styles.title}>{active.peer?.username ?? 'konto usunięte'}</h2>
            </header>

            <div className={styles.thread} ref={thread} data-testid="thread">
              {state.messages.map((message, index) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  grouped={!startsGroup(state.messages[index - 1], message)}
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
  const peer = conversation.peer?.username ?? '?';

  return (
    <button
      type="button"
      className={on ? styles.rowOn : styles.row}
      aria-current={on}
      onClick={onOpen}
      data-testid={`conversation-${conversation.id}`}
    >
      <Avatar name={peer} />
      <span className={styles.rowText}>
        <span className={styles.rowTop}>
          <span className={styles.peer}>{conversation.peer?.username ?? 'konto usunięte'}</span>
          {conversation.last_at && <span className={styles.stamp}>{formatStamp(conversation.last_at)}</span>}
        </span>
        <span className={styles.rowBottom}>
          <span className={styles.preview}>
            {conversation.last_body === null
              ? 'bez wiadomości'
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

/** Pick a person to write to; the list is short enough to filter locally. */
function NewChat() {
  const people = useChat((state) => state.people);
  const start = useChat((state) => state.start);
  const close = useChat((state) => state.closeNewChat);
  const [filter, setFilter] = useState('');

  const shown = people.filter((person) =>
    person.username.includes(filter.trim().toLowerCase()),
  );

  return (
    <div className={styles.newPanel} data-testid="new-chat">
      <div className={styles.newHead}>
        <strong>Napisz do kogoś</strong>
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
            <Avatar name={person.username} size={22} />
            <span className={styles.personName}>{person.username}</span>
            <button type="button" aria-label={`Napisz do ${person.username}`} onClick={() => void start(person.id)}>
              Napisz
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className={styles.empty}>Nie ma takiej osoby.</li>}
      </ul>
    </div>
  );
}

/**
 * One message: avatar, and — only when this is the first one in a row from the
 * same person — the name and the hour above the bubble.
 */
function MessageRow({ message, grouped }: { message: Message; grouped: boolean }) {
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
        ) : (
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
  const input = useRef<HTMLTextAreaElement>(null);

  // The field grows with what is typed, up to a few lines, then scrolls.
  useEffect(() => {
    const box = input.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }, [draft]);

  const submit = async () => {
    const ok = await send(draft);
    // Only a delivered message leaves the field empty; a failed one stays typed.
    if (ok) setDraft('');
  };

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className={styles.pill}>
        <textarea
          ref={input}
          className={styles.input}
          value={draft}
          placeholder={`Do: ${conversation.peer?.username ?? 'konto usunięte'}`}
          aria-label="Treść wiadomości"
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
      <button type="submit" className={styles.send} aria-label="Wyślij" disabled={sending || draft.trim() === ''}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12.6 2-12.6 2 .1 6.4Z"
          />
        </svg>
      </button>
    </form>
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
