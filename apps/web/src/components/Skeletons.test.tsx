import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { CardsSkeleton, MatrixSkeleton, PageSkeleton, PanelSkeleton } from './Skeletons';

describe('Skeletons', () => {
  it('says what is loading, the placeholders hidden from screen readers', () => {
    renderWithProviders(<CardsSkeleton label="Loading players" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading players');
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('draws a card per item, under a heading per group or as one list', () => {
    const { container, unmount } = renderWithProviders(
      <CardsSkeleton label="Loading" groups={2} cards={3} />,
    );
    expect(container.querySelectorAll('[class*="card"]')).toHaveLength(6);
    expect(container.querySelectorAll('[class*="groupHeading"]')).toHaveLength(2);
    unmount();

    const list = renderWithProviders(<CardsSkeleton label="Loading" groups={0} cards={4} dense />);
    expect(list.container.querySelectorAll('[class*="card"]')).toHaveLength(4);
    expect(list.container.querySelectorAll('[class*="groupHeading"]')).toHaveLength(0);
  });

  it('announces each kind once', () => {
    renderWithProviders(
      <>
        <PanelSkeleton label="Loading the queue" />
        <MatrixSkeleton label="Loading matchups" rows={2} columns={2} />
        <PageSkeleton label="Loading the event" header={<span>title</span>} />
      </>,
    );
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(3);
    ['Loading the queue', 'Loading matchups', 'Loading the event'].forEach((label, i) => {
      expect(statuses[i]).toHaveTextContent(label);
    });
  });
});
