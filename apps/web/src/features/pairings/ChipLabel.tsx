import type { PairingChip } from '@bcp/shared';
import { chipStyle } from './chip-style';

/** A game's chip and, small beside it, the chip it can become. */
export function ChipLabel({ chip, alt }: { chip: PairingChip; alt?: PairingChip }) {
  return (
    <>
      {chip}
      {alt && (
        <span
          style={{
            ...chipStyle(alt),
            marginLeft: 4,
            padding: '0 3px',
            borderRadius: 3,
            fontSize: '0.8em',
            boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.35)',
          }}
        >
          {alt}
        </span>
      )}
    </>
  );
}

/** How a game's rating reads aloud: "Y" or "Y, can become R". */
export const ratingName = (chip: PairingChip | null, alt?: PairingChip) =>
  chip === null ? 'unrated' : alt ? `${chip}, can become ${alt}` : chip;
