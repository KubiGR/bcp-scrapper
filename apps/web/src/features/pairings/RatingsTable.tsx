import {
  PAIRING_CHIPS,
  ratingPoints,
  type PairingChip,
  type PairingRating,
  type PairingRosterPlayer,
} from '@bcp/shared';
import {
  ActionIcon,
  Menu,
  Popover,
  Stack,
  Table,
  Text,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core';
import { ChipLabel, ratingName } from './ChipLabel';
import { chipStyle } from './chip-style';
import { shortArmy } from './army-name';
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

/** A chip's colour, beside its name in the cell menu. */
function Swatch({ chip }: { chip: PairingChip }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        borderRadius: 3,
        background: chipStyle(chip).background,
      }}
    />
  );
}

/** The menu's mark for what is chosen now. */
function Check() {
  return (
    <span aria-hidden="true" style={{ color: 'var(--mantine-color-teal-5)', fontWeight: 700 }}>
      ✓
    </span>
  );
}

/** A clipboard with lines: the army list. */
function ListIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M9 10h6M9 14h6M9 18h4" />
    </svg>
  );
}

/**
 * A player heading on three steady lines, the same in every row and column: the army (with the
 * button that opens the short list), the player, then the disposition badge with the detachments.
 * Lines too long end in "…"; a tap on the player or detachments (or the list button) opens
 * everything in full, with the short list.
 */
/** Everything about a player in full, with the short list: what a heading's popups show. */
function PlayerDetails({ player }: { player: PairingRosterPlayer }) {
  const detachments = player.detachments.join(' + ');
  return (
    <Stack gap={2}>
      <Text size="xs" fw={600}>
        {player.faction ?? player.name}
      </Text>
      {player.name !== player.faction && <Text size="xs">{player.name}</Text>}
      {player.disposition && (
        <Text size="xs" c="dimmed">
          {player.disposition}
        </Text>
      )}
      {detachments && (
        <Text size="xs" c="dimmed">
          {detachments}
        </Text>
      )}
      {player.list && (
        <Stack gap={0} mt={6}>
          {player.list.split('\n').map((line, k) => (
            <Text key={k} size="xs" lh={1.4}>
              {line}
            </Text>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function PlayerHeading({ player }: { player: PairingRosterPlayer }) {
  const army = player.faction ?? player.name;
  // Short ("Chaos Space Marines" → "CSM"); the hover keeps the full name.
  const label = player.faction ? shortArmy(player.faction) : player.name;
  const detachments = player.detachments.join(' + ');
  const popover = { position: 'bottom-start', withArrow: true, shadow: 'md', width: 280 } as const;
  return (
    <div className={classes.heading}>
      <div className={classes.army} data-line="army">
        <span className={classes.armyName} title={army}>
          <span aria-hidden="true">{label}</span>
          <VisuallyHidden>{army}</VisuallyHidden>
        </span>
        {player.list && (
          <Popover {...popover}>
            <Popover.Target>
              <ActionIcon variant="default" size="sm" aria-label={`${army} list`} title="List">
                <ListIcon />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown role="dialog" aria-label={`${army} details`}>
              <PlayerDetails player={player} />
            </Popover.Dropdown>
          </Popover>
        )}
      </div>
      <Popover {...popover}>
        <Popover.Target>
          <UnstyledButton className={classes.details} aria-label={`${army} details`}>
            <div className={classes.playerName} data-line="player">
              {player.name !== player.faction ? player.name : ' '}
            </div>
            <div className={classes.detail} data-line="detail">
              <DispositionBadge disposition={player.disposition} />
              {detachments && <span className={classes.detachments}>{detachments}</span>}
            </div>
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown role="dialog" aria-label={`${army} details`}>
          <PlayerDetails player={player} />
        </Popover.Dropdown>
      </Popover>
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
    <Table.ScrollContainer minWidth={600}>
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
            <th className={classes.avg}>
              <span className={classes.averageLabel}>Average</span>
            </th>
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
                            data-selected={c === chip || undefined}
                            fw={c === chip ? 700 : undefined}
                            leftSection={<Swatch chip={c} />}
                            rightSection={c === chip ? <Check /> : undefined}
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
                                data-selected={c === rating?.alt || undefined}
                                fw={c === rating?.alt ? 700 : undefined}
                                leftSection={<Swatch chip={c} />}
                                rightSection={c === rating?.alt ? <Check /> : undefined}
                                onClick={() => {
                                  onAlt(o.id, t.id, c);
                                }}
                              >
                                {c}
                              </Menu.Item>
                            ))}
                            <Menu.Item
                              aria-label="Can become: none"
                              data-selected={!rating?.alt || undefined}
                              fw={!rating?.alt ? 700 : undefined}
                              rightSection={!rating?.alt ? <Check /> : undefined}
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
              <span className={classes.averageLabel}>Average</span>
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
