import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './contexts/AuthContext';
import { HouseholdProvider } from './contexts/HouseholdContext';
import { SocketProvider } from './contexts/SocketContext';
import { MigrationBanner } from './components/auth/MigrationBanner';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MigrationBanner>
            <HouseholdProvider>
              <SocketProvider>
                <RouterProvider router={router} />
              </SocketProvider>
            </HouseholdProvider>
          </MigrationBanner>
        </AuthProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}
