import { Paper, Text, type PaperProps } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './Panel.module.css';

interface PanelProps extends PaperProps {
  /** Small monospace caption above the content. */
  title?: string;
  children: ReactNode;
}

/** The standard surface for every content block: a flat dark panel with a faint border. */
export function Panel({ title, children, ...paperProps }: PanelProps) {
  return (
    <Paper component="section" className={classes.panel} p="lg" {...paperProps}>
      {title !== undefined && <Text className={classes.label}>{title}</Text>}
      {children}
    </Paper>
  );
}
