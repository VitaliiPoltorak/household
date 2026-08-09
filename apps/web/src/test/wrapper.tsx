import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from '../contexts/AuthContext';
import { HouseholdProvider } from '../contexts/HouseholdContext';
import { setAccessToken } from '../api/client';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface WrapperOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
  preloadTokens?: boolean;
}

/**
 * Prime the app as if the user is signed in — post-#60 cookie flow.
 * - Sets the CSRF cookie so AuthProvider's mount-effect tries the refresh call
 *   (MSW handlers respond with a mock access token + user).
 * - Sets the module-level accessToken directly so any synchronous API call
 *   during the initial render already has a Bearer token.
 * - Also seeds activeHouseholdId in localStorage (this is HouseholdContext
 *   state, unrelated to auth).
 */
export function setAuthTokens() {
  document.cookie = 'household_csrf=test-csrf-token; path=/';
  setAccessToken('mock-access-token');
  localStorage.setItem('activeHouseholdId', 'hh-1');
}

export function clearAuthTokens() {
  document.cookie = 'household_csrf=; path=/; max-age=0';
  setAccessToken(null);
  localStorage.clear();
}

export function renderWithProviders(ui: React.ReactElement, options: WrapperOptions = {}) {
  const { initialEntries = ['/'], preloadTokens = true, ...renderOptions } = options;

  if (preloadTokens) setAuthTokens();

  const qc = makeQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <GoogleOAuthProvider clientId="test-client-id">
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={initialEntries}>
            <AuthProvider>
              <HouseholdProvider>
                {children}
              </HouseholdProvider>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </GoogleOAuthProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), qc };
}
