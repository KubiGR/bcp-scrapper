import { Checkbox, NumberInput, Select, TextInput } from '@mantine/core';
import type { Reroll } from '@bcp/shared';

/** A small whole-number field; with `nullable`, empty means none. */
export function Num({
  label,
  value,
  onChange,
  min,
  max,
  nullable = false,
  w = 72,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  nullable?: boolean;
  w?: number;
}) {
  return (
    <NumberInput
      size="xs"
      label={label}
      value={value ?? ''}
      min={min}
      max={max}
      w={w}
      allowDecimal={false}
      onChange={(next) => {
        if (next === '') onChange(nullable ? null : (min ?? 0));
        else onChange(typeof next === 'number' ? next : Number(next));
      }}
    />
  );
}

/** A dice field: 3, D6, 2D6, D6+3… */
export function DiceInput({
  label,
  value,
  onChange,
  w = 72,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  w?: number;
  placeholder?: string;
}) {
  return (
    <TextInput
      size="xs"
      label={label}
      value={value}
      w={w}
      placeholder={placeholder}
      onChange={(event) => {
        onChange(event.currentTarget.value);
      }}
    />
  );
}

export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      size="xs"
      label={label}
      checked={checked}
      onChange={(event) => {
        onChange(event.currentTarget.checked);
      }}
    />
  );
}

const REROLLS: { value: Reroll; label: string }[] = [
  { value: 'none', label: 'No re-roll' },
  { value: 'ones', label: 'Re-roll 1s' },
  { value: 'failures', label: 'Re-roll fails' },
  { value: 'fish', label: 'Re-roll non-criticals' },
];

export function RerollSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Reroll;
  onChange: (value: Reroll) => void;
}) {
  return (
    <Select
      size="xs"
      label={label}
      data={REROLLS}
      value={value}
      w={170}
      allowDeselect={false}
      onChange={(next) => {
        const found = REROLLS.find((r) => r.value === next);
        if (found !== undefined) onChange(found.value);
      }}
    />
  );
}

/** -1, 0 or +1. */
export function ModifierSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Select
      size="xs"
      label={label}
      data={['-1', '0', '+1']}
      value={value > 0 ? '+1' : String(value)}
      w={80}
      allowDeselect={false}
      onChange={(next) => {
        onChange(Number(next ?? '0'));
      }}
    />
  );
}

/** Critical on 2+ … 6+. */
export function CritSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Select
      size="xs"
      label={label}
      data={['6', '5', '4', '3', '2'].map((v) => ({ value: v, label: `${v}+` }))}
      value={String(value)}
      w={80}
      allowDeselect={false}
      onChange={(next) => {
        onChange(Number(next ?? '6'));
      }}
    />
  );
}
