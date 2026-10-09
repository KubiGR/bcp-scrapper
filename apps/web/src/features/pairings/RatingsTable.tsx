import {
  PAIRING_CHIPS,
  ratingPoints,
  type PairingChip,
  type PairingRating,
  type PairingRosterPlayer,
} from '@bcp/shared';
import { Menu, Popover, Table, Text, UnstyledButton } from '@mantine/core';
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

/**
 * A player as the team sheet heads a row or column: their name small, the army strong, the
 * disposition badge with the detachments, and the short list behind a button (it opens on click).
 */
function PlayerHeading({ player }: { player: PairingRosterPlayer }) {
  const army = player.faction ?? player.name;
  return (
    <div className={classes.heading}>
      {player.name !== player.faction && <div className={classes.playerName}>{player.name}</div>}
      <div className={classes.army}>{army}</div>
      {(Boolean(player.disposition) || player.detachments.length > 0) && (
        <div className={classes.detail}>
          <DispositionBadge disposition={player.disposition} />
          {player.detachments.length > 0 && <span>{player.detachments.join(' + ')}</span>}
        </div>
      )}
      {player.list && (
        <Popover position="bottom-start" withArrow shadow="md" width={260}>
          <Popover.Target>
            <UnstyledButton className={classes.listButton} aria-label={`${army} list`}>
              List · {player.list.split('\n').length} units
            </UnstyledButton>
          </Popover.Target>
          <Popover.Dropdown>
            <Text size="xs" fw={600} mb={4}>
              {army}
            </Text>
            {player.list.split('\n').map((line, k) => (
              <Text key={k} size="xs" lh={1.4}>
                {line}
              </Text>
            ))}
          </Popover.Dropdown>
        </Popover>
      )}
    </div>
  );
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
                <PlayerHeading player={t} />
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
                <PlayerHeading player={o} />
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
