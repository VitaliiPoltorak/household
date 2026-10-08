import { Stack } from 'expo-router';

// The overview draws its own title (Screen); pushed screens use the native header.
export default function ShoppingLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="new" options={{ title: 'New list' }} />
      <Stack.Screen name="[id]" options={{ title: 'Shopping list' }} />
      <Stack.Screen name="item" options={{ title: 'Edit item' }} />
    </Stack>
  );
}
