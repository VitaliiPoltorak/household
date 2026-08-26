import {
  formatDate,
  getDateFormatPreference,
  setDateFormatPreference,
} from '../lib/date-format';

describe('date-format (#275)', () => {
  const DATE = new Date(2026, 2, 5); // March 5, 2026 — day/month unambiguous

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to "auto" and matches toLocaleDateString()', () => {
    expect(getDateFormatPreference()).toBe('auto');
    expect(formatDate(DATE)).toBe(DATE.toLocaleDateString());
  });

  it('formats as DD/MM/YYYY', () => {
    setDateFormatPreference('DD/MM/YYYY');
    expect(formatDate(DATE)).toBe('05/03/2026');
  });

  it('formats as MM/DD/YYYY', () => {
    setDateFormatPreference('MM/DD/YYYY');
    expect(formatDate(DATE)).toBe('03/05/2026');
  });

  it('formats as YYYY-MM-DD', () => {
    setDateFormatPreference('YYYY-MM-DD');
    expect(formatDate(DATE)).toBe('2026-03-05');
  });

  it('accepts a date string, not just a Date object', () => {
    setDateFormatPreference('YYYY-MM-DD');
    // Not pinning the exact day: a UTC-midnight ISO string can render as the
    // previous local day depending on the test runner's timezone — the
    // point here is just that a string input is accepted and shaped right.
    expect(formatDate('2026-03-05T00:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('falls back to "auto" for a corrupted/unknown stored value', () => {
    localStorage.setItem('dateFormat', 'not-a-real-format');
    expect(getDateFormatPreference()).toBe('auto');
  });
});
