import { Stack } from 'expo-router';

// The list draws its own title (Screen); pushed form screens use the native header.
export default function TransactionsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="new" options={{ title: 'New transaction' }} />
      <Stack.Screen name="[id]" options={{ title: 'Transaction' }} />
    </Stack>
  );
}
