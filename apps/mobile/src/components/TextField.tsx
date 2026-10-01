import { StyleSheet, Text, TextInput } from 'react-native';
import type { TextInputProps } from 'react-native';

export function TextField({
  label,
  ...input
}: { label: string } & TextInputProps) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#999"
        autoCapitalize="none"
        style={styles.input}
        {...input}
      />
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '500', color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
  },
});
