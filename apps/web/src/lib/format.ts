const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

const eventDayFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

/** Event dates are calendar days: shown in UTC, so a date never shifts with the viewer's zone. */
export function formatEventDates(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  if (endIso === null) return eventDayFormat.format(start);
  return eventDayFormat.formatRange(start, new Date(endIso));
}

/** A `YYYY-MM-DD` calendar day, formatted like event dates. */
export function formatIsoDay(day: string): string {
  return eventDayFormat.format(new Date(`${day}T00:00:00Z`));
}

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** "432 players · 108 teams", or just the players when the team count isn't known. */
export function formatEventSize(event: { playerCount: number; teamCount: number | null }): string {
  const players = plural(event.playerCount, 'player');
  return event.teamCount === null ? players : `${players} · ${plural(event.teamCount, 'team')}`;
}

/** "5 rounds"/"1 round"; null when the round count is unknown (0). */
export function formatRoundCount(roundCount: number): string | null {
  return roundCount > 0 ? plural(roundCount, 'round') : null;
}

/** "35 s", "8 min", "1 h 20 min": a rough wait, for estimates. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
