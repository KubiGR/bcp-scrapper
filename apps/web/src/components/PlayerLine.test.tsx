import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { PlayerLine } from './PlayerLine';

describe('PlayerLine', () => {
  it('reads "Army · Detachment + Detachment · Disposition"', () => {
    renderWithProviders(
      <p data-testid="line">
        <PlayerLine
          faction="Orks"
          factionGuessed={false}
          detachments={['Kult of Speed', 'Wreckas']}
          disposition="Reconnaissance"
          extra="went first"
        />
      </p>,
    );
    expect(screen.getByTestId('line').textContent).toBe(
      'Orks · Kult of Speed + Wreckas · Reconnaissance · went first',
    );
  });

  it('leaves out missing parts', () => {
    renderWithProviders(
      <p data-testid="line">
        <PlayerLine faction="Orks" factionGuessed={false} detachments={[]} disposition={null} />
      </p>,
    );
    expect(screen.getByTestId('line').textContent).toBe('Orks');
  });
});
