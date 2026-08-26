import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, clearAuthTokens } from './wrapper';
import { SettingsPage } from '../pages/SettingsPage';
import { formatDate } from '../lib/date-format';

// SettingsPage renders many sections; this spec focuses on the date-format
// preference added in #275 (settings.dateFormat label is unique on the page).

describe('SettingsPage — date format preference (#275)', () => {
  beforeEach(() => {
    clearAuthTokens();
    localStorage.removeItem('dateFormat');
  });

  it('defaults to "Match my language" and previews today in that format', async () => {
    renderWithProviders(<SettingsPage />);

    const autoButton = await screen.findByRole('button', {
      name: 'Match my language',
    });
    expect(autoButton.className).toMatch(/border-primary-500/);
    expect(
      screen.getByText(`Today: ${new Date().toLocaleDateString()}`),
    ).toBeInTheDocument();
  });

  it('switches the preview and persists to localStorage when a preset is picked', async () => {
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('button', { name: 'Match my language' });

    await userEvent.click(screen.getByRole('button', { name: 'YYYY-MM-DD' }));

    // formatDate is separately unit-tested for calendar-math correctness
    // (date-format.test.ts) — this assertion is about SettingsPage actually
    // wiring the click through to state + localStorage + a re-render, not
    // re-deriving the expected string independently.
    expect(
      screen.getByText(`Today: ${formatDate(new Date())}`),
    ).toBeInTheDocument();
    expect(localStorage.getItem('dateFormat')).toBe('YYYY-MM-DD');
  });
});
