import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './wrapper';
import { Header } from '../components/layout/Header';
import { MOCK_USER } from './handlers';

describe('Header — mobile menu sheet', () => {
  it('shows the household name in the compact mobile bar', async () => {
    renderWithProviders(<Header />);
    expect(await screen.findByText('Test Home')).toBeInTheDocument();
  });

  it('opens the sheet from the avatar button, showing profile + nav + sign out', async () => {
    renderWithProviders(<Header />);
    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }));

    expect(await screen.findByText(MOCK_USER.email)).toBeInTheDocument();
    const sheet = screen
      .getByText('Invites')
      .closest('.fixed.inset-0') as HTMLElement;
    expect(within(sheet).getByText('Settings')).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
  });

  it('closes the sheet when the backdrop is clicked', async () => {
    renderWithProviders(<Header />);
    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }));
    expect(await screen.findByText('Invites')).toBeInTheDocument();

    // The backdrop is the sheet's fixed-inset wrapper — click it directly
    // (clicking the sheet panel itself is stopped via stopPropagation).
    const backdrop = screen.getByText('Invites').closest('.fixed.inset-0');
    expect(backdrop).not.toBeNull();
    await userEvent.click(backdrop as HTMLElement);

    await waitFor(() =>
      expect(screen.queryByText('Invites')).not.toBeInTheDocument(),
    );
  });

  it('closes the sheet after navigating to a link inside it', async () => {
    renderWithProviders(<Header />);
    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }));
    await userEvent.click(await screen.findByText('Settings'));

    await waitFor(() =>
      expect(screen.queryByText('Invites')).not.toBeInTheDocument(),
    );
  });
});
