import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from '../contexts/AuthContext';
import { HouseholdProvider } from '../contexts/HouseholdContext';

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

/** Pre-populate localStorage so AuthContext sees a logged-in user. */
export function setAuthTokens() {
  localStorage.setItem('accessToken', 'mock-access-token');
  localStorage.setItem('refreshToken', 'mock-refresh-token');
  localStorage.setItem('sessionId', 'mock-session-id');
  localStorage.setItem('activeHouseholdId', 'hh-1');
}

export function clearAuthTokens() {
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
