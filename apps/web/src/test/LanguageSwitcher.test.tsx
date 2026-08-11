import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './wrapper';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';

describe('LanguageSwitcher', () => {
  it('renders a single flag button (collapsed) by default', () => {
    renderWithProviders(<LanguageSwitcher />, { preloadTokens: false });
    // Only one button visible when closed — the trigger
    expect(screen.getAllByRole('button')).toHaveLength(1);
    // Dropdown menu is not in the DOM
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens dropdown with all four languages on click', () => {
    renderWithProviders(<LanguageSwitcher />, { preloadTokens: false });
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    // 4 language options
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(4);
    // All labels present (English is the default active label)
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Українська')).toBeInTheDocument();
    expect(screen.getByText('Deutsch')).toBeInTheDocument();
    expect(screen.getByText('Español')).toBeInTheDocument();
  });

  it('marks the active language and closes on Escape', async () => {
    renderWithProviders(<LanguageSwitcher />, { preloadTokens: false });
    fireEvent.click(screen.getByRole('button'));

    const items = screen.getAllByRole('menuitemradio');
    const active = items.find((el) => el.getAttribute('aria-checked') === 'true');
    expect(active).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('closes after selecting a language', async () => {
    renderWithProviders(<LanguageSwitcher />, { preloadTokens: false });
    fireEvent.click(screen.getByRole('button'));

    const german = screen.getByText('Deutsch');
    fireEvent.click(german);

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});
