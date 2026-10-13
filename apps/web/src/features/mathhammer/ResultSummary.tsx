import type { WeaponStep } from '@bcp/shared';
import { Button, Text } from '@mantine/core';
import classes from './ResultSummary.module.css';
import { percent, type Outcome } from './ResultPanel';

type Total = 'attacks' | 'hits' | 'wounds' | 'unsaved';

/** The averages down the attack sequence, then what they come to: [label, value]. */
function stats(outcome: Exclude<Outcome, { error: string }>): [string, string][] {
  const { breakdown, averages, wipe, leaderSlain } = outcome.result;
  const total = (key: Total) =>
    breakdown.reduce((sum: number, step: WeaponStep) => sum + step[key], 0).toFixed(2);
  return [
    ['Attacks', total('attacks')],
    ['Hits', total('hits')],
    ['Wounds', total('wounds')],
    ['Unsaved', total('unsaved')],
    ['Damage', averages.woundsDealt.toFixed(2)],
    ['Wasted', averages.wasted.toFixed(2)],
    ['Models slain', averages.modelsSlain.toFixed(2)],
    ['Wipe', percent(wipe)],
    ...(leaderSlain === null ? [] : [['Leader slain', percent(leaderSlain)] as [string, string]]),
  ];
}

/**
 * The result in one line, pinned to the bottom of the screen while the full result is out of
 * view: the averages from attacks to models slain, the chance to wipe the unit (and its leader).
 */
export function ResultSummary({ outcome, onShow }: { outcome: Outcome; onShow: () => void }) {
  return (
    <section aria-label="Result summary" className={classes.bar}>
      <div className={classes.row}>
        {'error' in outcome ? (
          <Text size="sm" c="red.4">{`Can’t calculate: ${outcome.error}`}</Text>
        ) : (
          <div className={`numeric ${classes.stats}`}>
            {stats(outcome).map(([label, value]) => (
              <Text size="sm" key={label}>
                <span className={classes.label}>{label}</span> {value}
              </Text>
            ))}
          </div>
        )}
        <Button size="xs" variant="light" onClick={onShow} className={classes.show}>
          Full result
        </Button>
      </div>
    </section>
  );
}
