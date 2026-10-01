import { TextField } from './TextField';

/** YYYY-MM-DD text entry; validation lives with the form (see isIsoDate). */
export function DateField({
  label = 'Date',
  value,
  onChangeText,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <TextField
      label={`${label} (YYYY-MM-DD)`}
      value={value}
      onChangeText={onChangeText}
      placeholder="2026-10-01"
      keyboardType="numbers-and-punctuation"
      maxLength={10}
    />
  );
}
