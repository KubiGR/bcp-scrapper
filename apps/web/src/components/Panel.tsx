import { Paper, Text, type PaperProps } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './Panel.module.css';

interface PanelProps extends PaperProps {
  /** Small uppercase caption above the content, like a HUD readout label. */
  title?: string;
  children: ReactNode;
}

/** The standard surface for every content block: dark glass, neon edge, cut corner. */
export function Panel({ title, children, ...paperProps }: PanelProps) {
  return (
    <Paper component="section" className={classes.panel} p="lg" {...paperProps}>
      {title !== undefined && <Text className={classes.label}>{title}</Text>}
      {children}
    </Paper>
  );
}
