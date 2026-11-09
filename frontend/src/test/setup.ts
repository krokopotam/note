import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * jsdom ships no PointerEvent, and this UI is dragged with pointer events.
 * Extending MouseEvent keeps clientX/clientY semantics intact.
 */
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventShim extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  // @ts-expect-error test shim: jsdom lacks the constructor entirely
  globalThis.PointerEvent = PointerEventShim;
  // @ts-expect-error same shim on the window object
  window.PointerEvent = PointerEventShim;
}

afterEach(() => {
  cleanup();
});
