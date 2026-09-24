import type { Outcome, Totals } from '@bcp/shared';

/** A score or VP; BCP doesn't serve VP for bracket events, so missing values show as a dash. */
export const formatPoints = (value: number | null): string =>
  value === null ? '–' : String(value);

export function outcomeLabel(outcome: Outcome | null): string {
  switch (outcome) {
    case 'win':
      return 'W';
    case 'loss':
      return 'L';
    case 'draw':
      return 'D';
    case 'bye':
      return 'Bye';
    case null:
      return '–';
  }
}

/** "3-0-1": wins (byes included), losses, draws. */
export const formatTotals = (totals: Totals): string =>
  `${totals.wins}-${totals.losses}-${totals.draws}`;
