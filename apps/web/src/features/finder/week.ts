const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 24 * 60 * 60 * 1000;

/**
 * The Monday-to-Sunday week (UTC, as the server groups them) an event starts in: its Monday as a
 * key, and "Week of 6–12 Apr" (or "Week of 30 Mar – 5 Apr") to show.
 */
export function weekOf(startDate: string): { key: string; label: string } {
  const start = new Date(startDate);
  const day = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  // getUTCDay: Sunday 0 … Saturday 6; Monday starts the week.
  const monday = new Date(day - ((start.getUTCDay() + 6) % 7) * DAY);
  const sunday = new Date(monday.getTime() + 6 * DAY);
  const month = (d: Date) => MONTHS[d.getUTCMonth()] ?? '';
  const label =
    monday.getUTCMonth() === sunday.getUTCMonth()
      ? `Week of ${String(monday.getUTCDate())}–${String(sunday.getUTCDate())} ${month(sunday)}`
      : `Week of ${String(monday.getUTCDate())} ${month(monday)} – ${String(sunday.getUTCDate())} ${month(sunday)}`;
  return { key: monday.toISOString().slice(0, 10), label };
}
