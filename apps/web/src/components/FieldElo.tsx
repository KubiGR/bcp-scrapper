import { HoverHint } from './HoverHint';
import classes from './FieldElo.module.css';

type Tier = 'weak' | 'average' | 'strong' | 'very-strong' | 'elite';

/**
 * Bands of 50 around the rankings' average field (1550): about the middle half of rated events is
 * average or strong, the top tenth very strong or elite.
 */
export function fieldEloTier(elo: number): { tier: Tier; name: string } {
  if (elo >= 1650) return { tier: 'elite', name: 'Elite field' };
  if (elo >= 1600) return { tier: 'very-strong', name: 'Very strong field' };
  if (elo >= 1550) return { tier: 'strong', name: 'Strong field' };
  if (elo >= 1500) return { tier: 'average', name: 'Average field' };
  return { tier: 'weak', name: 'Weak field' };
}

const HINT = 'average wh40k-elo of the field';

/**
 * "Elo 1712" (just "1712" under an Elo heading), coloured by how strong an event's field is;
 * nothing until enough of its players are rated.
 */
export function FieldElo({ elo, bare = false }: { elo: number | null; bare?: boolean }) {
  if (elo === null) return null;
  const { tier, name } = fieldEloTier(elo);
  return (
    <HoverHint hint={`${name}: ${HINT}`} label={`${name}: ${HINT} ${String(elo)}`}>
      <span className={classes.elo} data-tier={tier}>
        {bare ? elo : `Elo ${String(elo)}`}
      </span>
    </HoverHint>
  );
}
