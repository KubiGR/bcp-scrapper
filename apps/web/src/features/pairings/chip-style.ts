import { CHIP_COLOURS, type PairingChip } from '@bcp/shared';

const DARK_TEXT = new Set<PairingChip>(['BOUYA', 'Y', 'R']);

/** A chip's fill and the text colour that reads on it. */
export const chipStyle = (chip: PairingChip) => ({
  background: CHIP_COLOURS[chip],
  color: DARK_TEXT.has(chip) ? '#111' : '#fff',
});
