import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { ChangePasswordForm } from './ChangePasswordForm';

function fill(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Repeat new password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('ChangePasswordForm', () => {
  it('changes the password and reports back', async () => {
    const fetchMock = stubFetchRoutes({
      'POST /api/auth/password': { ok: true },
      'GET /api/auth/me': {},
    });
    const onDone = vi.fn();
    renderWithProviders(<ChangePasswordForm onDone={onDone} />);
    fill('old password', 'a new password 1', 'a new password 1');
    await vi.waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      current: 'old password',
      next: 'a new password 1',
    });
  });

  it('checks length and the repeat before sending', () => {
    const fetchMock = stubFetchRoutes({});
    renderWithProviders(<ChangePasswordForm />);
    fill('old password', 'short', 'short');
    expect(screen.getByText('At least 12 characters')).toBeInTheDocument();
    fill('', 'a new password 1', 'a new password 2');
    expect(screen.getByText('The passwords don’t match')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the API’s answer to a wrong current password', async () => {
    stubFetchRoutes({
      'POST /api/auth/password': () =>
        Response.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Current password is wrong' } },
          { status: 400 },
        ),
    });
    renderWithProviders(<ChangePasswordForm />);
    fill('bad password', 'a new password 1', 'a new password 1');
    expect(await screen.findByText('Current password is wrong')).toBeInTheDocument();
  });
});
