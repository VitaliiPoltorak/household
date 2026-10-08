import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { parseBulkNames } from '../lib/shopping';
import { ErrorText } from './ErrorText';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';

/** Single-item add, switchable to a comma/newline-separated bulk add (as on web). */
export function AddItems({
  existingNames,
  busy,
  error,
  onAdd,
  onBulkAdd,
}: {
  existingNames: string[];
  busy: boolean;
  error: string;
  onAdd: (name: string) => Promise<void>;
  onBulkAdd: (names: string[]) => Promise<void>;
}) {
  const [bulk, setBulk] = useState(false);
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState('');

  const submit = async () => {
    setLocalError('');
    if (bulk) {
      const names = parseBulkNames(text, existingNames);
      if (names.length === 0) {
        setLocalError(
          'Nothing to add: names need 3+ characters and must not already be on the list.',
        );
        return;
      }
      await onBulkAdd(names);
    } else {
      const name = text.trim();
      if (name.length < 3) {
        setLocalError('Item names need at least 3 characters.');
        return;
      }
      await onAdd(name);
    }
    setText('');
  };

  return (
    <View style={styles.box}>
      <ErrorText message={localError || error} />
      <TextField
        label={bulk ? 'Items (comma or new line separated)' : 'Add an item'}
        value={text}
        onChangeText={setText}
        autoCapitalize="sentences"
        multiline={bulk}
        returnKeyType={bulk ? 'default' : 'done'}
        onSubmitEditing={bulk ? undefined : () => void submit()}
        style={bulk ? styles.multiline : undefined}
      />
      <PrimaryButton
        label={bulk ? 'Add all' : 'Add'}
        onPress={() => void submit()}
        loading={busy}
      />
      <PrimaryButton
        label={bulk ? 'Add one at a time' : 'Bulk add'}
        variant="secondary"
        onPress={() => {
          setBulk((v) => !v);
          setLocalError('');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, paddingBottom: 12 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
