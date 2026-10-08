import type { Pair } from '@bcp/shared';
import type { ChainFollow } from './chain-layout';

/**
 * Who can no longer be chosen in a live pairing: the round-1 defenders once chosen, the
 * players in games already locked (each pick locks one) and the round-2 defenders once put up.
 * `games` are the locked games, ours v theirs (all five once round 2's picks are in). While just
 * planning, nobody.
 */
export function usedPlayers(
  d: number,
  e: number,
  follow: ChainFollow,
): { ours: number[]; theirs: number[]; games: Pair[] } {
  const ours: number[] = [];
  const theirs: number[] = [];
  const games: Pair[] = [];
  // Past the defenders, both are committed; before that, each once chosen.
  const underWay = [
    follow.theirSend,
    follow.weTake,
    follow.theyTake,
    follow.ourR2,
    follow.theirR2,
  ].some((v) => v !== undefined);
  if (underWay || follow.ourDefender) ours.push(d);
  if (underWay || follow.theirDefender) theirs.push(e);
  if (follow.weTake !== undefined) {
    theirs.push(follow.weTake);
    games.push([d, follow.weTake]);
  }
  if (follow.theyTake !== undefined) {
    ours.push(follow.theyTake);
    games.push([follow.theyTake, e]);
  }
  if (follow.ourR2 !== undefined) ours.push(follow.ourR2);
  if (follow.theirR2 !== undefined) theirs.push(follow.theirR2);
  // Round 2's picks lock two more games; with both, the refused pair plays the last one.
  if (follow.ourR2 !== undefined && follow.weTake2 !== undefined) {
    theirs.push(follow.weTake2);
    games.push([follow.ourR2, follow.weTake2]);
  }
  if (follow.theirR2 !== undefined && follow.theyTake2 !== undefined) {
    ours.push(follow.theyTake2);
    games.push([follow.theyTake2, follow.theirR2]);
  }
  if (games.length === 4) {
    const lastOurs = [0, 1, 2, 3, 4].find((a) => !ours.includes(a));
    const lastTheirs = [0, 1, 2, 3, 4].find((b) => !theirs.includes(b));
    if (lastOurs !== undefined && lastTheirs !== undefined) {
      ours.push(lastOurs);
      theirs.push(lastTheirs);
      games.push([lastOurs, lastTheirs]);
    }
  }
  return { ours, theirs, games };
}
