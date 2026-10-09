import { DISPOSITIONS } from './disposition-style';

/** A disposition as the team sheet shows it: its code on its colour, the full name on hover. */
export function DispositionBadge({ disposition }: { disposition: string | null | undefined }) {
  if (!disposition) return null;
  const style = DISPOSITIONS[disposition];
  return (
    <span
      title={disposition}
      style={{
        display: 'inline-block',
        flex: 'none',
        padding: '0 6px',
        borderRadius: 3,
        fontSize: 'var(--mantine-font-size-xs)',
        fontWeight: 700,
        background: style?.background ?? 'var(--mantine-color-default)',
        color: style?.color ?? 'var(--mantine-color-text)',
      }}
    >
      {style?.code ?? disposition}
    </span>
  );
}
