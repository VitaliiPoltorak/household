import { describe, expect, it } from 'vitest';
import { rootRedirectHref } from './root-redirect';

describe('rootRedirectHref', () => {
  it('sends a signed-out user to the sign-in screen', () => {
    expect(rootRedirectHref(false)).toBe('/login');
  });
  it('sends a signed-in user to the dashboard', () => {
    expect(rootRedirectHref(true)).toBe('/dashboard');
  });
});
