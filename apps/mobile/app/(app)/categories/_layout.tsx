import { Stack } from 'expo-router';

// The list draws its own title (Screen); pushed form screens use the native header.
// `title` on the hidden list is what those screens' back button shows (otherwise
// iOS falls back to the raw route name, "index").
export default function CategoriesLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ headerShown: false, title: 'Categories' }}
      />
      <Stack.Screen name="new" options={{ title: 'New category' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit category' }} />
    </Stack>
  );
}
