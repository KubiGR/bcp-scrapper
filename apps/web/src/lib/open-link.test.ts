import { describe, expect, it, vi } from 'vitest';
import { eventPath, listPath, openHere } from './open-link';

const click = (init: Partial<MouseEvent> = {}) => {
  const event = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...init,
  };
  return event;
};

describe('links that open in place', () => {
  it('build the addresses of an event and of a list in it', () => {
    expect(eventPath('EV 1')).toBe('/events/EV%201?tab=players');
    expect(listPath('EV 1', 'P/2')).toBe('/events/EV%201?tab=players&list=P%2F2');
  });

  it('open here on a plain click, instead of following the link', () => {
    const open = vi.fn();
    const event = click();
    openHere(open)(event as unknown as React.MouseEvent);
    expect(open).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('leave a ⌘, Ctrl, Shift or Alt click to the browser: a new tab or window', () => {
    for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
      const open = vi.fn();
      const event = click({ [key]: true });
      openHere(open)(event as unknown as React.MouseEvent);
      expect(open).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
      // The row under it doesn't open either.
      expect(event.stopPropagation).toHaveBeenCalled();
    }
  });
});
