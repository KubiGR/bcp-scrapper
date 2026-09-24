import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { DispositionText } from './DispositionText';

describe('DispositionText', () => {
  it('renders the disposition name', () => {
    renderWithProviders(<DispositionText disposition="Take and Hold" />);
    expect(screen.getByText('Take and Hold')).toBeInTheDocument();
  });

  it('colours a known disposition with its mapped colour', () => {
    renderWithProviders(<DispositionText disposition="Take and Hold" />);
    const el = screen.getByText('Take and Hold');
    expect(el.style.color).toContain('green');
  });

  it('renders an unknown disposition in a dimmed/gray colour', () => {
    renderWithProviders(<DispositionText disposition="Something New" />);
    const el = screen.getByText('Something New');
    expect(el.style.color).toContain('gray');
  });

  it('renders nothing for null', () => {
    renderWithProviders(<DispositionText disposition={null} />);
    expect(document.body.querySelector('span')).toBeNull();
  });
});
