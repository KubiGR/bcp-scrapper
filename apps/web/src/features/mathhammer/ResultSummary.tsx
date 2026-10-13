import { Button, Group, Text } from '@mantine/core';
import classes from './ResultSummary.module.css';
import { percent, type Outcome } from './ResultPanel';

/**
 * The result in one line, pinned to the bottom of the screen while the full result is out of
 * view: average models slain and wounds, the chance to wipe the unit (and its leader).
 */
export function ResultSummary({ outcome, onShow }: { outcome: Outcome; onShow: () => void }) {
  return (
    <section aria-label="Result summary" className={classes.bar}>
      <Group justify="space-between" wrap="nowrap" gap="md">
        {'error' in outcome ? (
          <Text size="sm" c="red.4">{`Can’t calculate: ${outcome.error}`}</Text>
        ) : (
          <Group gap="lg" wrap="wrap" className="numeric">
            <Text size="sm">
              <span className={classes.label}>Models slain</span>{' '}
              {outcome.result.averages.modelsSlain.toFixed(2)}
            </Text>
            <Text size="sm">
              <span className={classes.label}>Wounds</span>{' '}
              {outcome.result.averages.woundsDealt.toFixed(2)}
            </Text>
            <Text size="sm">
              <span className={classes.label}>Wipe</span> {percent(outcome.result.wipe)}
            </Text>
            {outcome.result.leaderSlain !== null && (
              <Text size="sm">
                <span className={classes.label}>Leader slain</span>{' '}
                {percent(outcome.result.leaderSlain)}
              </Text>
            )}
          </Group>
        )}
        <Button size="xs" variant="light" onClick={onShow}>
          Full result
        </Button>
      </Group>
    </section>
  );
}
