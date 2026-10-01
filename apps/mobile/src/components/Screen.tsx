import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

/**
 * Shared screen shell: safe-area padding plus a title header. Every screen
 * renders inside this instead of handling insets itself, so the notch /
 * home-indicator handling lives in one place. The bottom inset is left to
 * the tab bar on tab screens and applied here only for screens without one.
 */
export function Screen({ title, subtitle, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '700', color: '#111' },
  subtitle: { marginTop: 4, fontSize: 14, color: '#666' },
  body: { marginTop: 24, gap: 12 },
});
