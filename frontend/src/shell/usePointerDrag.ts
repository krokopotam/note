import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pointer-based dragging, ~60 lines and no dependency.
 *
 * A DnD library was deliberately avoided: those force their own model (drag
 * items, monitors, sensors) onto the code, and moving an icon is the part of this
 * UI most likely to change. Pointer events work with mouse, touch and pen.
 */

export interface DragDelta {
  dx: number;
  dy: number;
  /** Client coordinates of the pointer when the drag ended. */
  clientX: number;
  clientY: number;
}

interface DragOptions {
  onEnd?: (delta: DragDelta) => void;
  /** Called before every move; return false to veto the drag (e.g. renaming). */
  enabled?: () => boolean;
  /** Ignore releases that moved less than this many pixels, so a click is not a drag. */
  threshold?: number;
}

/**
 * @returns current offset while dragging (null when idle) and the handler to put
 *   on the element that starts the drag
 */
export function usePointerDrag({ onEnd, enabled, threshold = 4 }: DragOptions = {}) {
  const [delta, setDelta] = useState<DragDelta | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  // Latest callbacks without re-subscribing the window listeners on each render.
  const handlers = useRef({ onEnd, enabled, threshold });
  handlers.current = { onEnd, enabled, threshold };

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if (handlers.current.enabled && !handlers.current.enabled()) return;
    origin.current = { x: event.clientX, y: event.clientY };
    setDelta({ dx: 0, dy: 0, clientX: event.clientX, clientY: event.clientY });
  }, []);

  const dragging = delta !== null;

  useEffect(() => {
    if (!dragging) return undefined;

    const move = (event: PointerEvent) => {
      if (!origin.current) return;
      setDelta({
        dx: event.clientX - origin.current.x,
        dy: event.clientY - origin.current.y,
        clientX: event.clientX,
        clientY: event.clientY,
      });
    };

    const up = (event: PointerEvent) => {
      const from = origin.current;
      origin.current = null;
      setDelta(null);
      if (!from) return;

      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.abs(dx) < handlers.current.threshold && Math.abs(dy) < handlers.current.threshold) {
        return;
      }
      handlers.current.onEnd?.({ dx, dy, clientX: event.clientX, clientY: event.clientY });
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging]);

  return { delta, dragging, onPointerDown };
}
