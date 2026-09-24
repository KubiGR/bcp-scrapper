import { Anchor } from '@mantine/core';
import { createLink } from '@tanstack/react-router';

/** A Mantine `Anchor` with typed router navigation (`to`/`params`/`search`), the documented way
 * to combine TanStack Router's `Link` with a design-system component. */
export const AnchorLink = createLink(Anchor);
