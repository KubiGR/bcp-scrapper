import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { DispositionBreakdown } from './DispositionBreakdown';

describe('DispositionBreakdown', () => {
  it('leaves out dispositions that round to 0%', () => {
    renderWithProviders(
      <DispositionBreakdown
        archetype={{
          players: 536,
          dispositions: [
            { name: 'Take and Hold', players: 534 },
            { name: 'Disruption', players: 1 },
            { name: 'Reconnaissance', players: 1 },
          ],
        }}
      />,
    );
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.queryByText('Disruption')).not.toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });
});
