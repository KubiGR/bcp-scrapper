import type { ArchetypeRow } from '@bcp/shared';
import { Text } from '@mantine/core';
import { Fragment } from 'react';
import { DispositionText } from '../../components/DispositionText';

/**
 * Which dispositions an archetype's players picked, most first, as shares of its players:
 * "Take and Hold 60% · Purge the Foe 30%" (players with no known disposition make up the rest).
 */
export function DispositionBreakdown({
  archetype,
}: {
  archetype: Pick<ArchetypeRow, 'players' | 'dispositions'>;
}) {
  if (archetype.dispositions.length === 0 || archetype.players === 0) return null;
  return (
    <Text size="xs" c="dimmed" data-dispositions>
      {archetype.dispositions.map((disposition, index) => (
        <Fragment key={disposition.name}>
          {index > 0 && ' · '}
          <DispositionText disposition={disposition.name} />{' '}
          <span className="numeric">
            {Math.round((disposition.players / archetype.players) * 100)}%
          </span>
        </Fragment>
      ))}
    </Text>
  );
}
