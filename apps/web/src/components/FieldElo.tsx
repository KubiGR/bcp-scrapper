import { HoverHint } from './HoverHint';

const HINT = 'Average wh40k-elo of the field';

/**
 * "Elo 1712" (just "1712" under an Elo heading): how strong an event's field is; nothing until
 * enough of its players are rated.
 */
export function FieldElo({ elo, bare = false }: { elo: number | null; bare?: boolean }) {
  if (elo === null) return null;
  return (
    <HoverHint hint={HINT} label={`${HINT}: ${String(elo)}`}>
      {bare ? elo : `Elo ${String(elo)}`}
    </HoverHint>
  );
}
