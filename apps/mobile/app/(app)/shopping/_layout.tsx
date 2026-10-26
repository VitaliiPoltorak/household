import { Stack } from 'expo-router';

// The overview draws its own title (Screen); pushed screens use the native header.
// `title` on the hidden overview is what the pushed screens' back button shows
// (otherwise iOS falls back to the raw route name, "index").
export default function ShoppingLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ headerShown: false, title: 'Shopping' }}
      />
      <Stack.Screen name="new" options={{ title: 'New list' }} />
      <Stack.Screen name="[id]" options={{ title: 'Shopping list' }} />
      <Stack.Screen name="item" options={{ title: 'Edit item' }} />
    </Stack>
  );
}
