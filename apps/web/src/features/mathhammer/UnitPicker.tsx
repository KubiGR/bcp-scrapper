import type { UnitDatasheet } from '@bcp/shared';
import { Alert, Button, Group, MultiSelect, Select, Stack } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { SearchSelect } from '../../components/SearchSelect';
import { factionsQuery, unitsQuery } from './mathhammer-queries';
import { Check } from './inputs';

const sizeLabel = (sheet: UnitDatasheet, index: number) => {
  const size = sheet.sizes[index];
  const models = size?.models.reduce((s, m) => s + m.count, 0) ?? 0;
  const points =
    size?.points === null || size?.points === undefined ? '' : ` (${String(size.points)} pts)`;
  return `${String(models)} model${models === 1 ? '' : 's'}${points}`;
};

/**
 * Picks a unit from 39k.pro's datasheets: faction, unit, size and attached characters (only
 * those that can lead or support it, unless "show all"). "Use" fills the side.
 */
export function UnitPicker({
  label,
  onPick,
}: {
  label: string;
  onPick: (sheet: UnitDatasheet, sizeIndex: number, attached: UnitDatasheet[]) => void;
}) {
  const [faction, setFaction] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [size, setSize] = useState('0');
  const [attachIds, setAttachIds] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const factions = useQuery(factionsQuery);
  const units = useQuery({ ...unitsQuery(faction ?? ''), enabled: faction !== null });

  if (factions.error) {
    return (
      <Alert color="yellow" title="No unit data yet">
        {factions.error.message}
      </Alert>
    );
  }
  const sheets = units.data?.datasheets ?? [];
  const sheet = sheets.find((s) => s.id === unitId);
  const characters = sheets.filter(
    (s) =>
      s.keywords.includes('CHARACTER') &&
      s.id !== unitId &&
      (showAll ||
        (sheet !== undefined && (s.leads.includes(sheet.id) || s.supports.includes(sheet.id)))),
  );
  return (
    <Stack gap="xs">
      <Group gap="xs" align="flex-end">
        <SearchSelect
          size="xs"
          label={`${label} faction`}
          w={200}
          data={(factions.data?.factions ?? []).map((f) => f.faction)}
          value={faction}
          onChange={(next) => {
            setFaction(next);
            setUnitId(null);
            setAttachIds([]);
          }}
        />
        <SearchSelect
          size="xs"
          label={`${label} unit`}
          w={240}
          disabled={faction === null}
          data={sheets.map((s) => ({
            value: s.id,
            label: s.legends ? `${s.name} (Legends)` : s.name,
          }))}
          value={unitId}
          onChange={(next) => {
            setUnitId(next);
            setSize('0');
            setAttachIds([]);
          }}
        />
        {sheet !== undefined && sheet.sizes.length > 1 && (
          <Select
            size="xs"
            label="Size"
            w={150}
            allowDeselect={false}
            data={sheet.sizes.map((_, i) => ({ value: String(i), label: sizeLabel(sheet, i) }))}
            value={size}
            onChange={(next) => {
              setSize(next ?? '0');
            }}
          />
        )}
      </Group>
      {sheet !== undefined && (
        <Group gap="xs" align="flex-end">
          <MultiSelect
            size="xs"
            label="Attached characters"
            w={300}
            data={characters.map((c) => ({ value: c.id, label: c.name }))}
            value={attachIds}
            onChange={setAttachIds}
          />
          <Check label="Show all characters" checked={showAll} onChange={setShowAll} />
          <Button
            size="xs"
            onClick={() => {
              onPick(
                sheet,
                Number(size),
                attachIds.flatMap((id) => sheets.filter((s) => s.id === id)),
              );
            }}
          >
            Use
          </Button>
        </Group>
      )}
    </Stack>
  );
}
