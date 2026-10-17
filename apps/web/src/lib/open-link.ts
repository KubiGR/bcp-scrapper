import type { MouseEvent } from 'react';

const enc = encodeURIComponent;

/** An event's page, on its players. */
export const eventPath = (eventId: string) => `/events/${enc(eventId)}?tab=players`;

/** A list's own address: its event's players with the list open. */
export const listPath = (eventId: string, playerId: string) =>
  `${eventPath(eventId)}&list=${enc(playerId)}`;

/**
 * For a link that also opens in place: a plain click opens it here (a drawer, the router), while
 * ⌘/Ctrl, Shift or Alt leave it to the browser — a new tab or window, to keep several open. The
 * row under the link never opens as well.
 */
export function openHere(open: () => void) {
  return (event: MouseEvent) => {
    event.stopPropagation();
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    open();
  };
}
