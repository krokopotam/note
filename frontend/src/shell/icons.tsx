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
