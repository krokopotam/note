import { useEffect, useRef, useState } from 'react';
import { CHAT_POLL_MS, MESSAGE_EDIT_MINUTES, MESSAGE_MAX_LENGTH } from '@note/shared/manifest';
import { formatStamp } from '../../shared/format';
import { useChat } from './chatStore';
import type { Conversation, Message } from '../../api/types';
import type { AppProps } from '../../shell/registry';
import styles from './ChatApp.module.css';

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

  return (
    <div className={styles.app} data-testid="chat">
      <nav className={styles.side} aria-label="Rozmowy">
        <ul className={styles.list}>
          {state.conversations.map((conversation) => (
            <li key={conversation.id}>
              <ConversationRow conversation={conversation} onOpen={() => void state.open(conversation.id)} />
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
              <h2 className={styles.title}>{active.peer?.username ?? 'konto usunięte'}</h2>
            </header>

            <div className={styles.thread} ref={thread} data-testid="thread">
              {state.messages.map((message) => (
                <MessageRow key={message.id} message={message} />
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

function MessageRow({ message }: { message: Message }) {
  const edit = useChat((state) => state.edit);
  const remove = useChat((state) => state.remove);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(message.body);
  const field = useRef<HTMLTextAreaElement>(null);
  // The window is the server's; this clock only decides when to hide the button.
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

  return (
    <article
      className={`${styles.message} ${message.author_id === null ? styles.gone : ''}`}
      data-testid={`message-${message.id}`}
    >
      <header className={styles.meta}>
        <strong className={styles.author}>{message.author_name}</strong>
        <span className={styles.stamp}>{formatStamp(message.created_at)}</span>
        {message.edited_at && <span className={styles.edited}>edytowane</span>}
      </header>

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
        <p className={styles.body}>{message.body}</p>
      )}

      {stillOpen && !editing && (
        <span className={styles.actions}>
          <button
            type="button"
            onClick={() => {
              setText(message.body);
              setEditing(true);
            }}
          >
            Popraw
          </button>
          <button
            type="button"
            onClick={() => void remove(message.id)}
            aria-label={`Usuń wiadomość ${message.id}`}
          >
            Usuń
          </button>
          <span className={styles.left}>{secondsLeft(message.editable_until!, now)} s</span>
        </span>
      )}
    </article>
  );
}

function Composer({ conversation }: { conversation: Conversation }) {
  const send = useChat((state) => state.send);
  const sending = useChat((state) => state.sending);
  const [draft, setDraft] = useState('');

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
      <textarea
        className={styles.input}
        value={draft}
        placeholder={`Do: ${conversation.peer?.username ?? 'konto usunięte'}`}
        aria-label="Treść wiadomości"
        maxLength={MESSAGE_MAX_LENGTH}
        rows={2}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter is a new line — the way people expect.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <button type="submit" className={styles.send} disabled={sending || draft.trim() === ''}>
        Wyślij
      </button>
    </form>
  );
}

const secondsLeft = (untilIso: string, now: number) =>
  Math.max(0, Math.round((Date.parse(untilIso) - now) / 1000));
