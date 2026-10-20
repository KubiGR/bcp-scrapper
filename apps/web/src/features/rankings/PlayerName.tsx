import { Link } from '@tanstack/react-router';
import type { MouseEvent } from 'react';
import classes from './PlayerName.module.css';

const stop = (e: MouseEvent) => {
  e.stopPropagation();
};

/**
 * A player's name, linking to their page when BCP shows their account (a row that opens on click
 * doesn't open as well); plain text otherwise.
 */
export function PlayerName({ name, userId }: { name: string; userId: string | null | undefined }) {
  if (userId === null || userId === undefined) return <>{name}</>;
  return (
    <Link to="/players/$userId" params={{ userId }} className={classes.name} onClick={stop}>
      {name}
    </Link>
  );
}
