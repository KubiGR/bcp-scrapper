import type { CoveredRange, DateRange } from './api';

const DAY_MS = 86_400_000;

/** The finder's default window, and what the automatic refresh keeps current. */
export const LATEST_DAYS_BACK = 30;
export const LATEST_DAYS_AHEAD = 7;

/** Observed on BCP in 2026-09: roughly 50 new 40k events a day, 100 per search page. */
const EVENTS_PER_DAY_ESTIMATE = 50;
const EVENTS_PER_PAGE = 100;

/** `YYYY-MM-DD` of a moment, in UTC. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Shifts a `YYYY-MM-DD` calendar day by whole days. */
export function addDays(day: string, days: number): string {
  return toIsoDate(new Date(dayStart(day) + days * DAY_MS));
}

/** Number of calendar days in an inclusive range. */
export function daysIn(range: DateRange): number {
  return Math.round((dayStart(range.to) - dayStart(range.from)) / DAY_MS) + 1;
}

export function latestWindow(now: Date): DateRange {
  const today = toIsoDate(now);
  return { from: addDays(today, -LATEST_DAYS_BACK), to: addDays(today, LATEST_DAYS_AHEAD) };
}

/**
 * Merges overlapping or touching (next-day) ranges. A merged range keeps the OLDEST `syncedAt`,
 * so "synced at" never overstates how fresh the data is.
 */
export function mergeRanges(ranges: CoveredRange[]): CoveredRange[] {
  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
  const merged: CoveredRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.from <= addDays(last.to, 1)) {
      if (range.to > last.to) last.to = range.to;
      if (range.syncedAt < last.syncedAt) last.syncedAt = range.syncedAt;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** The parts of `window` that none of `covered` includes, in date order. */
export function findGaps(window: DateRange, covered: DateRange[]): DateRange[] {
  const gaps: DateRange[] = [];
  let cursor = window.from;
  for (const range of [...covered].sort((a, b) => a.from.localeCompare(b.from))) {
    if (range.to < cursor) continue;
    if (range.from > window.to) break;
    if (range.from > cursor) gaps.push({ from: cursor, to: addDays(range.from, -1) });
    const next = addDays(range.to, 1);
    if (next > cursor) cursor = next;
    if (cursor > window.to) return gaps;
  }
  if (cursor <= window.to) gaps.push({ from: cursor, to: window.to });
  return gaps;
}

/** Rough number of BCP search requests a catalogue sync of `range` costs. */
export function estimateCatalogRequests(range: DateRange): number {
  return Math.max(1, Math.ceil((daysIn(range) * EVENTS_PER_DAY_ESTIMATE) / EVENTS_PER_PAGE));
}

export interface EventSizeRule {
  minRounds: number;
  minPlayers: number;
}

/** RTTs (3 rounds or fewer) and events under 20 players are not stored or shown. */
export const BIG_EVENTS: EventSizeRule = { minRounds: 4, minPlayers: 20 };

/** Big enough to keep: at least `minRounds` rounds and `minPlayers` players. An unknown round count (0) is small. */
export function isBigEvent(
  event: { roundCount: number; playerCount: number },
  rule: EventSizeRule,
): boolean {
  return event.roundCount >= rule.minRounds && event.playerCount >= rule.minPlayers;
}
