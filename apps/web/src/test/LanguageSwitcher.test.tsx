import { fireEvent, screen, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import { renderWithProviders } from './wrapper';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';
import { supportedLngs } from '@household/locales';

describe('LanguageSwitcher', () => {
  it('renders a single flag button (collapsed) by default', () => {
    renderWithProviders(<LanguageSwitcher />, { preloadTokens: false });
    // Only one button visible when closed — the trigger
    expect(screen.getAllByRole('button')).toHaveLength(1);
    // Dropdown menu is not in the DOM
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens dropdown with all supported languages on click', () => {
    renderWithProviders(<LanguageSwitcher />, { preloadTokens: false });
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    // One menu item per supported language
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(supportedLngs.length);
    // Each language's native label (fetched via i18n, so this file stays English-only)
    for (const lng of supportedLngs) {
      expect(screen.getByText(i18n.t(`lang.${lng}`))).toBeInTheDocument();
    }
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

    const german = screen.getByText(i18n.t('lang.de'));
    fireEvent.click(german);

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});
