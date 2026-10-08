import {
  PAIRING_CHIPS,
  type PairingChip,
  type PairingRating,
  type PairingRosterPlayer,
} from '@bcp/shared';
import { Menu, Table, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { chipStyle } from './chip-style';
import classes from './RatingsTable.module.css';

/** Our players (rows) against theirs (columns); click a cell to pick its chip. */
export function RatingsTable({
  ours,
  theirs,
  ratings,
  onRate,
}: {
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  ratings: PairingRating[];
  onRate: (playerId: string, opponentPlayerId: string, chip: PairingChip | null) => void;
}) {
  const chipOf = new Map(ratings.map((r) => [`${r.playerId}|${r.opponentPlayerId}`, r.chip]));
  return (
    <Table.ScrollContainer minWidth={560}>
      <table className={classes.table}>
        <thead>
          <tr>
            <th />
            {theirs.map((t) => (
              <th key={t.id}>
                <Tooltip
                  label={
                    <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                      {t.list ?? 'No list'}
                    </Text>
                  }
                  multiline
                  w={320}
                >
                  <span tabIndex={0}>
                    {t.name !== t.faction && (
                      <Text size="xs" c="dimmed">
                        {t.name}
                      </Text>
                    )}
                    <Text size="sm">{t.faction ?? '—'}</Text>
                    {t.detachments.length > 0 && (
                      <Text size="xs" c="dimmed">
                        {t.detachments.join(' + ')}
                      </Text>
                    )}
                  </span>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ours.map((o) => (
            <tr key={o.id}>
              <th scope="row">
                <Text size="sm">{o.faction ?? o.name}</Text>
                {o.name !== o.faction && (
                  <Text size="xs" c="dimmed">
                    {o.name}
                  </Text>
                )}
              </th>
              {theirs.map((t) => {
                const chip = chipOf.get(`${o.id}|${t.id}`) ?? null;
                return (
                  <td key={t.id}>
                    <Menu position="bottom" withinPortal>
                      <Menu.Target>
                        <UnstyledButton
                          aria-label={`${o.name} v ${t.name}: ${chip ?? 'unrated'}`}
                          className={chip ? classes.cell : `${classes.cell} ${classes.unrated}`}
                          style={chip ? chipStyle(chip) : undefined}
                        >
                          {chip ?? '–'}
                        </UnstyledButton>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {PAIRING_CHIPS.map((c) => (
                          <Menu.Item
                            key={c}
                            onClick={() => {
                              onRate(o.id, t.id, c);
                            }}
                          >
                            {c}
                          </Menu.Item>
                        ))}
                        <Menu.Divider />
                        <Menu.Item
                          onClick={() => {
                            onRate(o.id, t.id, null);
                          }}
                        >
                          Clear
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Table.ScrollContainer>
  );
}
