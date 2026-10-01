import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const secondary = variant === 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        (pressed || loading) && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? '#2563eb' : '#fff'} />
      ) : (
        <Text style={[styles.label, secondary && styles.secondaryLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  secondary: { backgroundColor: '#fff' },
  pressed: { opacity: 0.7 },
  label: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryLabel: { color: '#2563eb' },
});
