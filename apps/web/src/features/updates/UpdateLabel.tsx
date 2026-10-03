import { updateOfDay } from '@bcp/shared';
import { Text, type TextProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { effectiveOf, updatesQuery } from './updates-queries';

/** The game update an event starting at `startDate` was played under; nothing without updates. */
export function UpdateLabel({
  startDate,
  prefix = '',
  ...textProps
}: { startDate: string; prefix?: string } & TextProps) {
  const { data } = useQuery(updatesQuery);
  const updates = effectiveOf(data);
  if (updates.length === 0) return null;
  const update = updateOfDay(updates, startDate.slice(0, 10));
  return <Text {...textProps}>{`${prefix}${update?.name ?? 'Before first update'}`}</Text>;
}
