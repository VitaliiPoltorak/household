import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenProps {
  /**
   * Draws the screen's own title header (and the top safe-area inset). Omit
   * it on screens under a native navigation header, which already handles
   * both.
   */
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  /** Wrap in a ScrollView (default). Pass false when the body is a FlatList. */
  scroll?: boolean;
}

/**
 * Shared screen shell: safe-area padding plus a title header. Every screen
 * renders inside this instead of handling insets itself, so the notch /
 * home-indicator handling lives in one place. Scrolls so forms stay
 * reachable when the keyboard is open.
 */
export function Screen({
  title,
  subtitle,
  children,
  scroll = true,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const paddingTop = title ? insets.top + 16 : 16;
  const header = title ? (
    <>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </>
  ) : null;

  if (!scroll) {
    return (
      <View style={[styles.root, styles.inner, { paddingTop }]}>
        {header}
        <View style={[styles.body, styles.fill]}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop, paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.inner}>
        {header}
        <View style={styles.body}>{children}</View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  inner: { paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '700', color: '#111' },
  subtitle: { marginTop: 4, fontSize: 14, color: '#666' },
  body: { marginTop: 24, gap: 12 },
  fill: { flex: 1 },
});
