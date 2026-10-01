import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';

function RootStack() {
  const { isSignedIn, isLoading } = useAuth();
  // Hold the splash until the stored session has been tried, so a signed-in
  // user never sees a flash of the login screen on launch.
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
      <AuthProvider>
        <RootStack />
        <StatusBar style="auto" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
