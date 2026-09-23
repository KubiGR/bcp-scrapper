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

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** "432 players · 108 teams", or just the players when the team count isn't known. */
export function formatEventSize(event: { playerCount: number; teamCount: number | null }): string {
  const players = plural(event.playerCount, 'player');
  return event.teamCount === null ? players : `${players} · ${plural(event.teamCount, 'team')}`;
}
