import { Checkbox, NumberInput, Select, SimpleGrid, TextInput } from '@mantine/core';
import type { Reroll } from '@bcp/shared';
import { Children, useState, type ReactNode } from 'react';
import classes from './inputs.module.css';

/**
 * A small whole-number field, kept within `min`/`max`; with `nullable`, empty means none.
 * Half-typed text ("-", or empty in a field that needs a number) stays in the field until it
 * becomes a number, so the calculation never sees it.
 */
export function Num({
  label,
  value,
  onChange,
  min,
  max,
  nullable = false,
  w = 72,
  disabled = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  nullable?: boolean;
  w?: number;
  disabled?: boolean;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <NumberInput
      size="xs"
      label={label}
      value={typing ?? value ?? ''}
      min={min}
      max={max}
      w={w}
      disabled={disabled}
      allowDecimal={false}
      onBlur={() => {
        setTyping(null);
      }}
      onChange={(next) => {
        const number = typeof next === 'number' ? next : Number.NaN;
        if (next === '' && nullable) {
          setTyping(null);
          onChange(null);
        } else if (Number.isFinite(number)) {
          setTyping(null);
          onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, number)));
        } else setTyping(String(next));
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
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  w?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <TextInput
      size="xs"
      label={label}
      value={value}
      w={w}
      disabled={disabled}
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

/** Checkboxes in even columns, each in its own box (highlighted when ticked). */
export function CheckGrid({ children }: { children: ReactNode }) {
  return (
    <SimpleGrid cols={{ base: 2, xs: 3, md: 5 }} spacing="xs" verticalSpacing="xs">
      {Children.map(children, (child) =>
        child === null || child === false ? null : <div className={classes.checkCell}>{child}</div>,
      )}
    </SimpleGrid>
  );
}
