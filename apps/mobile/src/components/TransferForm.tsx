import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { CreateTransferInput } from '../api/finance';
import type { Account } from '../api/types';
import { useRates } from '../hooks/useTransactions';
import { convert } from '../lib/currency';
import { isIsoDate, todayIso } from '../lib/dates';
import {
  RATE_WARN_THRESHOLD,
  buildTransferPayload,
  parseAmount,
  rateDeviation,
} from '../lib/transfer';
import { Chips } from './Chips';
import { DateField } from './DateField';
import { ErrorText } from './ErrorText';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';

const label = (a: Account) => `${a.name} (${a.currency})`;

/**
 * Transfer between two accounts. Cross-currency (#162): a second "received"
 * field appears, auto-filled from the market rate until the user edits it
 * (real transfers deviate — fees, spread). Never falls back to 1:1 when no
 * rate is available; the user must type the received amount.
 */
export function TransferForm({
  accounts,
  error,
  busy,
  onSubmit,
}: {
  accounts: Account[];
  error: string;
  busy: boolean;
  onSubmit: (payload: CreateTransferInput) => void;
}) {
  const [fromId, setFromId] = useState(accounts[0]?.id ?? '');
  const [toId, setToId] = useState(accounts[1]?.id ?? '');
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [toTouched, setToTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayIso());
  const [localError, setLocalError] = useState('');

  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const cross = !!from && !!to && from.currency !== to.currency;
  const rates = useRates(cross);

  const marketRate = useMemo(
    () =>
      cross && rates.data && from && to
        ? convert(1, from.currency, to.currency, rates.data)
        : null,
    [cross, rates.data, from, to],
  );

  // Auto-fill the received amount until the user takes over.
  useEffect(() => {
    if (!cross || toTouched || marketRate === null) return;
    const n = parseAmount(fromText);
    setToText(Number.isFinite(n) && n > 0 ? (n * marketRate).toFixed(2) : '');
  }, [cross, toTouched, marketRate, fromText]);

  // A new account pair starts a fresh transfer.
  useEffect(() => {
    setToTouched(false);
    setToText('');
  }, [fromId, toId]);

  if (accounts.length < 2) {
    return (
      <Text style={styles.warn}>
        You need at least two accounts to make a transfer.
      </Text>
    );
  }

  const fromNum = parseAmount(fromText);
  const toNum = parseAmount(toText);
  const deviation = rateDeviation(fromNum, toNum, marketRate);

  const submit = () => {
    if (!from || !to || from.id === to.id) {
      setLocalError('Pick two different accounts.');
      return;
    }
    if (!Number.isFinite(fromNum) || fromNum <= 0) {
      setLocalError('Enter the amount sent.');
      return;
    }
    if (cross && (!Number.isFinite(toNum) || toNum <= 0)) {
      setLocalError('Enter the amount received.');
      return;
    }
    if (!isIsoDate(date)) {
      setLocalError('Enter a valid date as YYYY-MM-DD.');
      return;
    }
    setLocalError('');
    onSubmit(
      buildTransferPayload({
        fromAccountId: from.id,
        toAccountId: to.id,
        fromCurrency: from.currency,
        toCurrency: to.currency,
        fromAmount: fromNum,
        toAmount: toNum,
        description,
        date,
      }),
    );
  };

  return (
    <>
      <ErrorText message={localError || error} />
      <Chips
        label="From"
        options={accounts.map((a) => ({ value: a.id, label: label(a) }))}
        value={fromId}
        onChange={setFromId}
      />
      <Chips
        label="To"
        options={accounts
          .filter((a) => a.id !== fromId)
          .map((a) => ({ value: a.id, label: label(a) }))}
        value={toId}
        onChange={setToId}
      />
      <TextField
        label={`Sent${from ? ` (${from.currency})` : ''}`}
        value={fromText}
        onChangeText={setFromText}
        keyboardType="numbers-and-punctuation"
        placeholder="0.00"
      />
      {cross && to ? (
        <>
          <TextField
            label={`Received (${to.currency})`}
            value={toText}
            onChangeText={(v) => {
              setToText(v);
              setToTouched(true);
            }}
            keyboardType="numbers-and-punctuation"
            placeholder="0.00"
          />
          {marketRate !== null && from ? (
            <Text style={styles.hint}>
              Market rate: 1 {from.currency} = {marketRate.toFixed(4)}{' '}
              {to.currency}
            </Text>
          ) : rates.isLoading ? (
            <Text style={styles.hint}>Loading rates…</Text>
          ) : (
            <Text style={styles.warn}>
              Rate unavailable — enter the amount received.
            </Text>
          )}
          {toTouched && marketRate !== null ? (
            <PrimaryButton
              label="Recalculate from market rate"
              variant="secondary"
              onPress={() => setToTouched(false)}
            />
          ) : null}
          {deviation !== null && deviation > RATE_WARN_THRESHOLD ? (
            <Text style={styles.warn}>
              That rate differs from the market by {Math.round(deviation * 100)}
              %. Double-check the amounts.
            </Text>
          ) : null}
        </>
      ) : null}
      <DateField value={date} onChangeText={setDate} />
      <TextField
        label="Note (optional)"
        value={description}
        onChangeText={setDescription}
        autoCapitalize="sentences"
      />
      <PrimaryButton label="Transfer" onPress={submit} loading={busy} />
    </>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, color: '#666' },
  warn: {
    fontSize: 13,
    color: '#b45309',
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 10,
  },
});
