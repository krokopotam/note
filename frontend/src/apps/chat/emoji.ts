/**
 * Emotikonki for the composer.
 *
 * A short list, grouped the way people reach for them, rather than the whole
 * Unicode catalogue: a picker you have to search is a picker nobody opens. These
 * are plain characters — nothing about them touches the server, they travel inside
 * the text of a message like any other letter.
 */

export interface EmojiGroup {
  id: string;
  label: string;
  emojis: string[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: 'buzie',
    label: 'Buzie',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
      '🤐', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😔', '😪',
      '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '😱',
      '😨', '😰', '😥', '😢', '😭', '😤', '😡', '🤬', '😈', '💀',
    ],
  },
  {
    id: 'geesty',
    label: 'Gesty',
    emojis: [
      '👍', '👎', '👌', '🤌', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙',
      '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋',
      '🤝', '🙏', '✍️', '💪', '🦾', '👏', '🙌', '👐', '🤲', '🫶',
      '🤦', '🤷', '💁', '🙋', '🙇', '🕴️', '🧠', '👀', '👁️', '🦵',
    ],
  },
  {
    id: 'serca',
    label: 'Serca',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️',
      '😻', '💌', '💋', '🌹', '🥀', '💐', '🎁', '🎀', '💍', '🥂',
    ],
  },
  {
    id: 'zwierzeta',
    label: 'Zwierzęta',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦅',
      '🦉', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐢', '🐍',
      '🐙', '🦑', '🦀', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊',
    ],
  },
  {
    id: 'jedzenie',
    label: 'Jedzenie',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
      '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🥦', '🥕',
      '🌽', '🌶️', '🥔', '🍞', '🥐', '🥖', '🧀', '🥚', '🍳', '🥞',
      '🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🍝', '🍲', '🍰', '☕',
    ],
  },
  {
    id: 'swiat',
    label: 'Świat',
    emojis: [
      '☀️', '🌤️', '⛅', '🌧️', '⛈️', '🌩️', '❄️', '☃️', '🌈', '💨',
      '🌙', '⭐', '🌟', '✨', '⚡', '🔥', '💧', '🌊', '🏠', '🏡',
      '🚗', '🚕', '🚌', '🏎️', '🏍️', '🚲', '✈️', '🚀', '⏰', '📅',
      '✅', '❌', '❗', '❓', '💯', '🎉', '🎊', '🏆', '🥇', '🎯',
    ],
  },
];

/** Where the caret sits inside the text, so an emoji lands where the person was typing. */
export interface Caret {
  start: number;
  end: number;
}

/**
 * Put an emoji where the caret is: replacing the selection if there is one,
 * appending if the caret is at the end.
 *
 * @returns the new text and where the caret should go afterwards
 */
export function insertAtCaret(
  text: string,
  caret: Caret,
  emoji: string,
): { text: string; caret: number } {
  const start = Math.max(0, Math.min(caret.start, text.length));
  const end = Math.max(start, Math.min(caret.end, text.length));
  const next = text.slice(0, start) + emoji + text.slice(end);

  // [...next].length would count characters, but the string is cut by code unit
  // index, so the caret has to move by the code units the emoji takes.
  return { text: next, caret: start + emoji.length };
}
