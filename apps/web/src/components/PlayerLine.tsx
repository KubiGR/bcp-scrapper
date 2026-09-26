import { Fragment, type ReactNode } from 'react';
import { DispositionText } from './DispositionText';
import { FactionText } from './FactionText';

interface PlayerLineProps {
  faction: string | null;
  factionGuessed: boolean;
  detachments: string[];
  disposition: string | null;
  /** Appended last, e.g. "went first" or a team name. */
  extra?: string | null;
}

/** "Army · Detachment + Detachment · Disposition", leaving out what isn't known. */
export function PlayerLine({
  faction,
  factionGuessed,
  detachments,
  disposition,
  extra,
}: PlayerLineProps) {
  const parts: { key: string; node: ReactNode }[] = [
    { key: 'faction', node: <FactionText faction={faction} guessed={factionGuessed} /> },
  ];
  if (detachments.length > 0) parts.push({ key: 'detachments', node: detachments.join(' + ') });
  if (disposition !== null) {
    parts.push({ key: 'disposition', node: <DispositionText disposition={disposition} /> });
  }
  if (extra) parts.push({ key: 'extra', node: extra });
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index > 0 && ' · '}
          {part.node}
        </Fragment>
      ))}
    </>
  );
}
