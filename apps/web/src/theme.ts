import {
  Autocomplete,
  createTheme,
  MultiSelect,
  Select,
  type MantineColorsTuple,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { prefixFilter } from './lib/prefix-filter';
import classes from './theme.module.css';

/**
 * Near-black navy. Mantine's dark scheme uses dark[7] for the page, dark[6] for surfaces,
 * dark[4] for borders and dark[0] for text, so this tuple sets the whole mood.
 */
const dark: MantineColorsTuple = [
  '#d5def0',
  '#a9b7d1',
  '#7f8fb0',
  '#5a6a8e',
  '#3d4c70',
  '#2a3656',
  '#1b2440',
  '#121a30',
  '#0b1122',
  '#060a16',
];

/** Neon cyan: the primary accent for actions, focus rings and highlights. */
const neon: MantineColorsTuple = [
  '#e0fdff',
  '#b3f7ff',
  '#80f0ff',
  '#4de8ff',
  '#26e2ff',
  '#00dcff',
  '#00c4e6',
  '#00a3bf',
  '#008299',
  '#006173',
];

/** Plasma magenta: secondary accent. Use sparingly so cyan stays the lead colour. */
const plasma: MantineColorsTuple = [
  '#ffe3fb',
  '#ffb8f3',
  '#ff8ceb',
  '#ff5fe3',
  '#ff3bdc',
  '#ff1fd6',
  '#e600bf',
  '#b80099',
  '#8a0073',
  '#5c004d',
];

export const theme = createTheme({
  colors: { dark, neon, plasma },
  primaryColor: 'neon',
  primaryShade: { light: 6, dark: 5 },
  white: '#eef3ff',
  black: '#060a16',
  fontFamily: '"Exo 2 Variable", system-ui, sans-serif',
  fontFamilyMonospace: '"JetBrains Mono Variable", ui-monospace, monospace',
  headings: {
    fontFamily: '"Exo 2 Variable", sans-serif',
    fontWeight: '600',
    // Fluid sizing: shrinks on narrow phones so titles fit their container, and locks back
    // to the original fixed size from ~600px viewport width up, so desktop and tablet are
    // pixel-identical to before.
    sizes: {
      h1: { fontSize: 'clamp(1.25rem, 4vw + 0.625rem, 2.125rem)', lineHeight: '1.3' },
      h2: { fontSize: 'clamp(1rem, 4vw + 0.125rem, 1.625rem)', lineHeight: '1.35' },
    },
  },
  defaultRadius: 0,
  cursorType: 'pointer',
  components: {
    // Typing in a dropdown finds names by their first letters first ("ne" → Necrons).
    Select: Select.extend({ defaultProps: { filter: prefixFilter } }),
    MultiSelect: MultiSelect.extend({
      defaultProps: { filter: prefixFilter },
      // One long pill shouldn't double the box's height: the typing field takes what room the
      // pills leave, and leaves the layout while nobody types (see theme.module.css).
      styles: { inputField: { minWidth: 0 } },
      classNames: { inputField: classes.multiSelectField },
    }),
    Autocomplete: Autocomplete.extend({ defaultProps: { filter: prefixFilter } }),
    // The calendar marks today, so a range can be read against it.
    DatePickerInput: DatePickerInput.extend({ defaultProps: { highlightToday: true } }),
  },
});
