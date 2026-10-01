import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { HouseholdProvider } from '../src/household/HouseholdContext';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RootStack() {
  const { isSignedIn, isLoading } = useAuth();
  // Hold the splash until the stored session has been tried, so a signed-in
  // user never sees a flash of the login screen on launch.
  // Drop cached data on sign-out so the next account never sees the last one's.
  useEffect(() => {
    if (!isSignedIn) queryClient.clear();
  }, [isSignedIn]);
  if (isLoading) return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <HouseholdProvider>
            <RootStack />
            <StatusBar style="auto" />
          </HouseholdProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
