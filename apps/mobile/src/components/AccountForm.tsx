import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { Account, EnabledAccountType } from '../api/types';
import { Chips } from './Chips';
import { ErrorText } from './ErrorText';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';

// Same fixed list as apps/web's account form.
const CURRENCIES = ['UAH', 'USD', 'EUR'];

export interface AccountFormValues {
  name: string;
  type: string;
  currency: string;
  /** Only meaningful on create; undefined when left blank. */
  initialBalance?: number;
  allowsNegativeBalance: boolean;
}

export function AccountForm({
  account,
  enabledTypes,
  submitLabel,
  error,
  busy,
  onSubmit,
}: {
  /** Present when editing; absent when creating. */
  account?: Account;
  enabledTypes: EnabledAccountType[];
  submitLabel: string;
  error: string;
  busy: boolean;
  onSubmit: (values: AccountFormValues) => void;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState(account?.type ?? 'bank');
  const [currency, setCurrency] = useState(account?.currency ?? 'UAH');
  const [balance, setBalance] = useState('');
  const [allowsNegative, setAllowsNegative] = useState(
    account?.allowsNegativeBalance ?? false,
  );
  const [localError, setLocalError] = useState('');

  const typeOptions = enabledTypes.map((t) => ({
    value: t.typeCode,
    label: t.accountType.label,
  }));
  // An account may carry a type the household has since disabled; keep it selectable.
  if (type && !typeOptions.some((o) => o.value === type)) {
    typeOptions.push({ value: type, label: type });
  }

  const submit = () => {
    if (!name.trim()) {
      setLocalError('Enter a name.');
      return;
    }
    const parsed = parseFloat(balance.replace(',', '.'));
    if (!account && balance.trim() && !Number.isFinite(parsed)) {
      setLocalError('Opening balance must be a number.');
      return;
    }
    setLocalError('');
    onSubmit({
      name: name.trim(),
      type,
      currency,
      initialBalance: !account && Number.isFinite(parsed) ? parsed : undefined,
      allowsNegativeBalance: allowsNegative,
    });
  };

  return (
    <>
      <ErrorText message={localError || error} />
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="sentences"
      />
      <Chips
        label="Type"
        options={typeOptions}
        value={type}
        onChange={setType}
      />
      <Chips
        label="Currency"
        options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        value={currency}
        onChange={setCurrency}
      />
      {!account ? (
        <TextField
          label="Opening balance (optional)"
          value={balance}
          onChangeText={setBalance}
          keyboardType="numbers-and-punctuation"
          placeholder="0.00"
        />
      ) : null}
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Allow negative balance</Text>
        <Switch value={allowsNegative} onValueChange={setAllowsNegative} />
      </View>
      <PrimaryButton label={submitLabel} onPress={submit} loading={busy} />
    </>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: { fontSize: 16, color: '#111' },
});
