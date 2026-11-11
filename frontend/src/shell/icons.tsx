/**
 * Inline SVG icons, no icon font or icon package: an icon is ~10 lines of markup
 * and can be edited or deleted without touching a dependency.
 */
interface IconProps {
  size?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 48 48',
  focusable: false as const,
  'aria-hidden': true as const,
});

export function CalculatorIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="9" y="5" width="30" height="38" rx="5" fill="#3d4657" />
      <rect x="13" y="9" width="22" height="8" rx="2" fill="#c9f24d" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={13 + col * 7.6}
            y={21 + row * 7.6}
            width="6"
            height="6"
            rx="1.5"
            fill="#8f9bb3"
          />
        )),
      )}
    </svg>
  );
}

export function NotepadIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="8" y="5" width="32" height="38" rx="4" fill="#f4f6fb" />
      <rect x="8" y="5" width="32" height="8" rx="4" fill="#2f6fed" />
      <path d="M14 20h20M14 26h20M14 32h13" stroke="#98a4bd" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function StickiesIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="8" y="8" width="26" height="26" rx="3" fill="#ffd83d" transform="rotate(-6 21 21)" />
      <rect x="16" y="14" width="24" height="24" rx="3" fill="#4ec97f" />
      <path d="M21 22h14M21 28h9" stroke="#1c6b40" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function FolderIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M5 13a3 3 0 0 1 3-3h9l4 5h19a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"
        fill="#e8b23a"
      />
      <path d="M5 19h38v16a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="#ffd166" />
    </svg>
  );
}

export function ChatIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M6 10a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H17l-8 7v-7H10a4 4 0 0 1-4-4z"
        fill="#4bb3a5"
      />
      <circle cx="15" cy="17" r="2.2" fill="#0e1726" />
      <circle cx="23" cy="17" r="2.2" fill="#0e1726" />
      <circle cx="31" cy="17" r="2.2" fill="#0e1726" />
    </svg>
  );
}

export function FilesIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M11 6h17l9 9v27a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z" fill="#4b8ef0" />
      <path d="M28 6l9 9h-9z" fill="#a9caff" />
      <path
        d="M24 35V21m0 0l-5 5m5-5l5 5"
        stroke="#0e1726"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Seven game glyphs. They share one visual trick — a dark plate with the thing
 * itself on it — so a row of them reads as one family in the Gry folder.
 */
const plate = () => <rect x="7" y="7" width="34" height="34" rx="8" fill="#1d2637" />;

export function SnakeIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      {plate()}
      <path
        d="M14 34h8v-8h8v-8h8"
        stroke="#4ec97f"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="36" cy="16" r="3.4" fill="#b6ff8f" />
      <circle cx="14" cy="16" r="4" fill="#ff5d5d" />
    </svg>
  );
}

export function TetrisIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      {plate()}
      <rect x="13" y="25" width="9" height="9" rx="2" fill="#4cc3ff" />
      <rect x="22" y="25" width="9" height="9" rx="2" fill="#4cc3ff" />
      <rect x="22" y="16" width="9" height="9" rx="2" fill="#4cc3ff" />
      <rect x="31" y="16" width="9" height="9" rx="2" fill="#4cc3ff" />
      <rect x="13" y="34" width="22" height="5" rx="2" fill="#ffd83d" />
    </svg>
  );
}

export function BubblesIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      {plate()}
      <circle cx="17" cy="17" r="6" fill="#ff5d5d" />
      <circle cx="30" cy="17" r="6" fill="#4cc3ff" />
      <circle cx="23" cy="28" r="6" fill="#ffd83d" />
      <circle cx="24" cy="38" r="4.5" fill="#5ddc7f" />
    </svg>
  );
}

export function Billiard2dIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      {plate()}
      <rect x="9" y="14" width="30" height="20" rx="4" fill="#15774e" stroke="#5c3520" strokeWidth="2.5" />
      <circle cx="15" cy="24" r="2.6" fill="#0a0d13" />
      <circle cx="33" cy="24" r="2.6" fill="#0a0d13" />
      <circle cx="22" cy="24" r="3.1" fill="#f7f3e8" />
      <circle cx="29" cy="21" r="3.1" fill="#d93a3a" />
      <path d="M31 29 43 36" stroke="#d8a35c" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function PinballIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      {plate()}
      <path d="M13 12h22v26H13z" fill="#1b1038" stroke="#6b4fa8" strokeWidth="2" />
      <path d="M13 20c0-6 4.5-9 11-9s11 3 11 9" fill="#1b1038" stroke="#6b4fa8" strokeWidth="2" />
      <circle cx="19" cy="20" r="3" fill="#e23c1c" />
      <circle cx="29" cy="18" r="3" fill="#20b2c8" />
      <circle cx="24" cy="26" r="3" fill="#f2c418" />
      <path d="M16 34l6 4" stroke="#e23c1c" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M32 34l-6 4" stroke="#e23c1c" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="24" cy="31" r="2.4" fill="#f7f3e8" />
    </svg>
  );
}

export function Billiard3dIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      {plate()}
      <path d="M8 22 24 14l16 8-16 8z" fill="#15774e" stroke="#5c3520" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 22v5l16 8V22" fill="#0f5f3e" stroke="#5c3520" strokeWidth="2" strokeLinejoin="round" />
      <path d="M40 22v5l-16 8" fill="#0b4a30" stroke="#5c3520" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="21" cy="23" r="3.4" fill="#f7f3e8" />
      <circle cx="29" cy="20" r="3.2" fill="#f2c744" />
      <path d="M33 26 44 33" stroke="#d8a35c" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function TilesIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      {plate()}
      <rect x="12" y="12" width="11" height="11" rx="3" fill="#e9e2d0" />
      <rect x="25" y="12" width="11" height="11" rx="3" fill="#f0a97a" />
      <rect x="12" y="25" width="11" height="11" rx="3" fill="#edc22e" />
      <rect x="25" y="25" width="11" height="11" rx="3" fill="#59d97f" />
    </svg>
  );
}

export function MinesIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      {plate()}
      <circle cx="24" cy="26" r="9" fill="#e9effa" />
      <path d="M24 12v6M24 34v6M10 26h6M32 26h6M14 16l4 4M34 16l-4 4M14 36l4-4M34 36l-4-4" stroke="#e9effa" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="21" cy="23" r="2.4" fill="#8f9bb3" />
    </svg>
  );
}

export function MemoryIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      {plate()}
      <rect x="12" y="13" width="12" height="22" rx="3" fill="#f2f5fc" />
      <rect x="26" y="13" width="12" height="22" rx="3" fill="#2f6fed" />
      <circle cx="18" cy="24" r="3.4" fill="#ff8a5c" />
    </svg>
  );
}

export function TicTacToeIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      {plate()}
      <path d="M20 12v24M28 12v24M12 20h24M12 28h24" stroke="#4a5772" strokeWidth="2" strokeLinecap="round" />
      <path d="M13 13l5 5M18 13l-5 5" stroke="#6fb0ff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="33" cy="33" r="3.6" fill="none" stroke="#ffb46f" strokeWidth="2.6" />
    </svg>
  );
}

export function UnknownAppIcon({ size = 48 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="8" y="8" width="32" height="32" rx="6" fill="#5b6478" />
      <path
        d="M19 18a5 5 0 1 1 6.5 4.8c-1.2.4-1.5 1.2-1.5 2.2M24 33h.02"
        stroke="#e8ecf5"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function CloseIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden focusable="false">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function GridIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      {[4, 11, 18].map((y) =>
        [4, 11, 18].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" fill="currentColor" />),
      )}
    </svg>
  );
}

export function HomeIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function BackIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        d="M15 5 8 12l7 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
