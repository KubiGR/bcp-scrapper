import { fireEvent, screen } from '@testing-library/react';

/** Opens the Mantine select labelled `label` and picks `option` from it. */
export async function pickOption(label: string, option: string) {
  const [input] = screen.getAllByLabelText(label);
  if (input === undefined) throw new Error(`no ${label} input`);
  fireEvent.click(input);
  fireEvent.click(await screen.findByRole('option', { name: option }));
}
