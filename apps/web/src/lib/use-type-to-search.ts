import { useMediaQuery } from '@mantine/hooks';

/**
 * Whether pickers take typing to search: not on a touch screen, where focusing the text opens
 * the keyboard, which shrinks the page and flips the list above the field. There the list is
 * scrolled and tapped instead.
 */
export function useTypeToSearch(): boolean {
  return !useMediaQuery('(pointer: coarse)', false, { getInitialValueInEffect: false });
}
