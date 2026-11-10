import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearViewportStub, stubViewport } from '../test/viewport';
import { isPhone, usePhone } from './viewport';

afterEach(clearViewportStub);

describe('telefon czy pulpit', () => {
  it('says phone below the breakpoint and desktop above it', () => {
    stubViewport(390);
    expect(isPhone()).toBe(true);
    expect(renderHook(() => usePhone()).result.current).toBe(true);

    clearViewportStub();
    stubViewport(1280);
    expect(isPhone()).toBe(false);
    expect(renderHook(() => usePhone()).result.current).toBe(false);
  });

  it('follows the screen while it is being resized', () => {
    const viewport = stubViewport(1280);
    const { result } = renderHook(() => usePhone());

    expect(result.current).toBe(false);

    // The browser fires the change itself, so the test has to say when React
    // is allowed to react to it.
    act(() => viewport.resize(420));
    expect(result.current).toBe(true);

    act(() => viewport.resize(1024));
    expect(result.current).toBe(false);
  });

  it('stops listening when the component goes away', () => {
    const viewport = stubViewport(1280);
    const { unmount } = renderHook(() => usePhone());

    expect(viewport.listenerCount()).toBeGreaterThan(0);

    unmount();
    expect(viewport.listenerCount()).toBe(0);
  });

  it('falls back to the desktop when the browser has no matchMedia', () => {
    // jsdom itself is in this situation; nothing may throw because of it.
    vi.stubGlobal('matchMedia', undefined);

    expect(isPhone()).toBe(false);
    expect(renderHook(() => usePhone()).result.current).toBe(false);
  });
});
