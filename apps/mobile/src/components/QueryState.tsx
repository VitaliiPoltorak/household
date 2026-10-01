import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';

/** Centered message used for empty / no-household / error states. */
export function Notice({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <PrimaryButton
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 32, gap: 8, alignItems: 'stretch' },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
  },
  body: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 8 },
});
