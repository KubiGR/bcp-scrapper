import {
  PAIRING_CHIPS,
  ratingPoints,
  type PairingChip,
  type PairingRating,
  type PairingRosterPlayer,
} from '@bcp/shared';
import { Menu, Table, Text, UnstyledButton } from '@mantine/core';
import { ChipLabel, ratingName } from './ChipLabel';
import { chipStyle } from './chip-style';
import { DispositionBadge } from './DispositionBadge';
import classes from './RatingsTable.module.css';

/** A row's or column's rated games as the team sheet shows them: "11.5 ± 1.5" (mean ± spread). */
function spread(games: (PairingRating | undefined)[]): string {
  const points = games.flatMap((r) => (r ? [ratingPoints(r.chip, r.alt)] : []));
  if (points.length === 0) return '–';
  const mean = points.reduce((sum, v) => sum + v, 0) / points.length;
  const sd = Math.sqrt(points.reduce((sum, v) => sum + (v - mean) ** 2, 0) / points.length);
  return `${mean.toFixed(1)} ± ${sd.toFixed(1)}`;
}

/** Our players (rows) against theirs (columns); click a cell to pick its chip. */
export function RatingsTable({
  ours,
  theirs,
  ratings,
  onRate,
  onAlt,
  used,
}: {
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  ratings: PairingRating[];
  onRate: (playerId: string, opponentPlayerId: string, chip: PairingChip | null) => void;
  /** Sets what a rated game can become (null: nothing). */
  onAlt: (playerId: string, opponentPlayerId: string, alt: PairingChip | null) => void;
  /** Players used up in a live pairing (by place) and the games locked in: greyed out, marked. */
  used?: { ours: number[]; theirs: number[]; games: [number, number][] };
}) {
  const usedOurs = new Set(used?.ours);
  const usedTheirs = new Set(used?.theirs);
  const locked = new Set(used?.games.map(([a, b]) => `${String(a)}|${String(b)}`));
  const ratingOf = new Map(ratings.map((r) => [`${r.playerId}|${r.opponentPlayerId}`, r]));
  return (
    <Table.ScrollContainer minWidth={560}>
      <table className={classes.table} aria-label="Ratings">
        <thead>
          <tr>
            <th className={classes.names} />
            {theirs.map((t, j) => (
              <th
                key={t.id}
                data-used={usedTheirs.has(j) || undefined}
                className={usedTheirs.has(j) ? classes.used : undefined}
              >
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
                {t.list && (
                  <div className={classes.list}>
                    {t.list.split('\n').map((line, k) => (
                      <Text key={k} size="xs" c="dimmed" lh={1.25}>
                        {line}
                      </Text>
                    ))}
                  </div>
                )}
                <DispositionBadge disposition={t.disposition} />
              </th>
            ))}
            <th className={classes.avg}>Average</th>
          </tr>
        </thead>
        <tbody>
          {ours.map((o, i) => (
            <tr key={o.id}>
              <th
                scope="row"
                data-used={usedOurs.has(i) || undefined}
                className={usedOurs.has(i) ? classes.used : undefined}
              >
                <Text size="sm">{o.faction ?? o.name}</Text>
                {o.name !== o.faction && (
                  <Text size="xs" c="dimmed">
                    {o.name}
                  </Text>
                )}
                <DispositionBadge disposition={o.disposition} />
              </th>
              {theirs.map((t, j) => {
                const rating = ratingOf.get(`${o.id}|${t.id}`);
                const chip = rating?.chip ?? null;
                const isLocked = locked.has(`${String(i)}|${String(j)}`);
                const isUsed = !isLocked && (usedOurs.has(i) || usedTheirs.has(j));
                return (
                  <td
                    key={t.id}
                    className={isLocked ? classes.locked : isUsed ? classes.used : undefined}
                  >
                    <Menu position="bottom" withinPortal>
                      <Menu.Target>
                        <UnstyledButton
                          aria-label={`${o.name} v ${t.name}: ${ratingName(chip, rating?.alt)}${isLocked ? ', locked in' : ''}`}
                          className={chip ? classes.cell : `${classes.cell} ${classes.unrated}`}
                          style={chip ? chipStyle(chip) : undefined}
                        >
                          {chip ? <ChipLabel chip={chip} alt={rating?.alt} /> : '–'}
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
                        {chip && (
                          <>
                            <Menu.Divider />
                            <Menu.Label>Can become</Menu.Label>
                            {PAIRING_CHIPS.filter((c) => c !== chip).map((c) => (
                              <Menu.Item
                                key={c}
                                aria-label={`Can become ${c}`}
                                onClick={() => {
                                  onAlt(o.id, t.id, c);
                                }}
                              >
                                {c}
                              </Menu.Item>
                            ))}
                            <Menu.Item
                              aria-label="Can become: none"
                              onClick={() => {
                                onAlt(o.id, t.id, null);
                              }}
                            >
                              Nothing
                            </Menu.Item>
                          </>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                  </td>
                );
              })}
              <td aria-label={`${o.faction ?? o.name} average`} className={classes.average}>
                {spread(theirs.map((t) => ratingOf.get(`${o.id}|${t.id}`)))}
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">
              <Text size="sm">Average</Text>
            </th>
            {theirs.map((t) => (
              <td
                key={t.id}
                aria-label={`${t.faction ?? t.name} average`}
                className={classes.average}
              >
                {spread(ours.map((o) => ratingOf.get(`${o.id}|${t.id}`)))}
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </Table.ScrollContainer>
  );
}
