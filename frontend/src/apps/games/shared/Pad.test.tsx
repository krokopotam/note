import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSwipe } from './Pad';

describe('swipe', () => {
  it('zamienia gest w kierunek', () => {
    const seen = vi.fn();
    const { result } = renderHook(() => useSwipe(seen));

    result.current.onPointerDown({ clientX: 100, clientY: 100 });
    result.current.onPointerUp({ clientX: 220, clientY: 104 });
    expect(seen).toHaveBeenLastCalledWith('right');

    result.current.onPointerDown({ clientX: 100, clientY: 100 });
    result.current.onPointerUp({ clientX: 96, clientY: 20 });
    expect(seen).toHaveBeenLastCalledWith('up');
  });

  it('nie zmyśla kierunku przy kiwnięciu palcem', () => {
    const seen = vi.fn();
    const { result } = renderHook(() => useSwipe(seen));

    result.current.onPointerDown({ clientX: 100, clientY: 100 });
    result.current.onPointerUp({ clientX: 108, clientY: 96 });

    expect(seen).not.toHaveBeenCalled();
  });

  it('ignoruje gest rozpoczęty poza planszą', () => {
    const seen = vi.fn();
    const { result } = renderHook(() => useSwipe(seen));

    result.current.onPointerUp({ clientX: 400, clientY: 10 });

    expect(seen).not.toHaveBeenCalled();
  });
});
