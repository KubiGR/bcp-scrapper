import type { ArchetypeRow } from '@bcp/shared';
import { Text } from '@mantine/core';
import { Fragment } from 'react';
import { DispositionText } from '../../components/DispositionText';

/**
 * Which dispositions an archetype's players picked, most first, as shares of its players:
 * "Take and Hold 60% · Purge the Foe 30%" (players with no known disposition make up the rest).
 * Ones that round to 0 % are left out.
 */
export function DispositionBreakdown({
  archetype,
}: {
  archetype: Pick<ArchetypeRow, 'players' | 'dispositions'>;
}) {
  const shown = archetype.dispositions
    .map((disposition) => ({
      name: disposition.name,
      percent: Math.round((disposition.players / archetype.players) * 100),
    }))
    .filter((disposition) => disposition.percent > 0);
  if (shown.length === 0 || archetype.players === 0) return null;
  return (
    <Text size="xs" c="dimmed" data-dispositions>
      {shown.map((disposition, index) => (
        <Fragment key={disposition.name}>
          {index > 0 && ' · '}
          <DispositionText disposition={disposition.name} />{' '}
          <span className="numeric">{disposition.percent}%</span>
        </Fragment>
      ))}
    </Text>
  );
}
