import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { financeApi, type CreateTransferPayload } from '../../api/finance';
import type { Account } from '../../types/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { useRatesState, convert } from '../../hooks/useRates';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

interface Props {
  hid: string;
  accounts: Account[];
  onClose: () => void;
  onCreated: () => void;
}

// Amounts differing from market by more than this fraction get a soft
// warning — non-blocking, since real transfers legitimately deviate (fees,
// spread, cross-border). Just a nudge to catch typos.
const RATE_WARN_THRESHOLD = 0.05;

/**
 * Create a two-leg transfer between two of the household's accounts.
 *
 * Cross-currency (#162): shows two amount fields when the source and
 * destination accounts have different currencies. The "Received" field
 * auto-fills from the live PrivatBank rate but is fully editable so the
 * user can enter the real amount the bank credited (fees, spread etc.).
 */
export function TransferModal({ hid, accounts, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [fromId, setFromId] = useState(accounts[0]?.id ?? '');
  const [toId, setToId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  // Tracks whether the user has manually edited toAmount. Auto-fill only
  // overwrites while this is false — the moment the user types, we back off.
  const [toAmountTouched, setToAmountTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);

  const fromAcc = accounts.find((a) => a.id === fromId) ?? null;
  const toAcc = accounts.find((a) => a.id === toId) ?? null;
  const fromCcy = fromAcc?.currency ?? 'UAH';
  const toCcy = toAcc?.currency ?? 'UAH';
  const isCrossCurrency = fromCcy !== toCcy;

  // Only fetch rates when actually needed — same-currency transfers don't
  // touch PrivatBank at all.
  const ratesState = useRatesState(isCrossCurrency);

  // Market rate expressed as "1 fromCcy = X toCcy", used for both auto-fill
  // and the informative label. Null when rates aren't ready.
  const marketRate = useMemo<number | null>(() => {
    if (!isCrossCurrency || ratesState.status !== 'ready') return null;
    const converted = convert(1, fromCcy, toCcy, ratesState.rates);
    return converted;
  }, [isCrossCurrency, ratesState, fromCcy, toCcy]);

  // Auto-fill toAmount from fromAmount * marketRate — but only while the
  // user hasn't manually edited toAmount and only when we actually have a
  // rate. Explicitly refuse to fall back to 1:1: silently defaulting would
  // let a mistyped ₴1000 become $1000 without any signal.
  useEffect(() => {
    if (!isCrossCurrency) return;
    if (toAmountTouched) return;
    if (marketRate === null) return;
    const parsed = parseFloat(fromAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setToAmount('');
      return;
    }
    setToAmount((parsed * marketRate).toFixed(2));
  }, [fromAmount, marketRate, isCrossCurrency, toAmountTouched]);

  // When accounts change, treat as a fresh transfer — reset the touched flag
  // and clear the derived field so we re-auto-fill from the new pair.
  useEffect(() => {
    setToAmountTouched(false);
    setToAmount('');
  }, [fromId, toId]);

  const recalc = () => {
    setToAmountTouched(false);
    // The touched-flag change triggers the effect above.
  };

  const fromNum = parseFloat(fromAmount);
  const toNum = parseFloat(toAmount);
  const effectiveRate = Number.isFinite(fromNum) && Number.isFinite(toNum) && fromNum > 0
    ? toNum / fromNum
    : null;

  const rateDeviation = effectiveRate !== null && marketRate !== null && marketRate > 0
    ? Math.abs(effectiveRate - marketRate) / marketRate
    : null;
  const showRateWarning = rateDeviation !== null && rateDeviation > RATE_WARN_THRESHOLD;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: CreateTransferPayload = isCrossCurrency
        ? {
            fromAccountId: fromId,
            toAccountId: toId,
            fromAmount: fromNum,
            toAmount: toNum,
            currency: fromCcy,
            toCurrency: toCcy,
            description: description || undefined,
            date,
          }
        : {
            fromAccountId: fromId,
            toAccountId: toId,
            // Same-currency: fromAmount is what the user typed; toAmount
            // mirrors it. Send explicit both-legs for consistency with the
            // cross-currency path (backend accepts either shape).
            fromAmount: fromNum,
            toAmount: fromNum,
            currency: fromCcy,
            description: description || undefined,
            date,
          };
      await financeApi.createTransfer(hid, payload);
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  if (accounts.length < 2) {
    return (
      <Modal title={t('transactions.transferTitle')} onClose={onClose}>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          {t('transactions.transferNeedsTwoAccounts')}
        </p>
        <div className="flex justify-end pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </Modal>
    );
  }

  const submitDisabled =
    saving
    || !fromAmount
    || fromId === toId
    || (isCrossCurrency && (!toAmount || !Number.isFinite(toNum) || toNum <= 0));

  return (
    <Modal title={t('transactions.transferTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Select label={t('transactions.from')} value={fromId}
          onChange={(e) => setFromId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </Select>
        <Select label={t('transactions.to')} value={toId}
          onChange={(e) => setToId(e.target.value)}>
          {accounts.filter((a) => a.id !== fromId).map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </Select>

        <Input
          label={`${t('transactions.transferSent')} (${fromCcy})`}
          type="number" step="0.01" min="0.01"
          value={fromAmount}
          onChange={(e) => setFromAmount(e.target.value)}
          required
          placeholder="0.00"
          autoFocus
        />

        {isCrossCurrency && (
          <div className="space-y-1">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label={`${t('transactions.transferReceived')} (${toCcy})`}
                  type="number" step="0.01" min="0.01"
                  value={toAmount}
                  onChange={(e) => {
                    setToAmount(e.target.value);
                    setToAmountTouched(true);
                  }}
                  required
                  placeholder="0.00"
                />
              </div>
              <button
                type="button"
                onClick={recalc}
                disabled={marketRate === null}
                title={t('transactions.transferRecalcTitle')}
                className="mb-[2px] flex h-[38px] w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg text-gray-500 transition-colors hover:border-primary-400 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:text-primary-400"
              >
                ↻
              </button>
            </div>
            {ratesState.status === 'ready' && marketRate !== null ? (
              <p className="pl-1 text-xs text-gray-400 dark:text-gray-500">
                {t('transactions.transferEffectiveRate', {
                  from: fromCcy,
                  rate: marketRate.toFixed(4),
                  to: toCcy,
                })}
                {effectiveRate !== null && (
                  <>
                    {' · '}
                    <span className={showRateWarning ? 'text-amber-600 dark:text-amber-400' : ''}>
                      {t('transactions.transferYourRate', { rate: effectiveRate.toFixed(4) })}
                    </span>
                  </>
                )}
              </p>
            ) : ratesState.status === 'loading' ? (
              <p className="pl-1 text-xs text-gray-400 dark:text-gray-500">{t('accounts.loading')}</p>
            ) : (
              <p className="pl-1 text-xs text-amber-600 dark:text-amber-400">
                {t('transactions.transferRateUnavailable')}
              </p>
            )}
          </div>
        )}

        <Input label={t('transactions.date')} type="date" value={date}
          onChange={(e) => setDate(e.target.value)} required />

        <Input
          label={`${t('transactions.description')} (${t('common.optional')})`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={submitDisabled}>
            {saving ? t('transactions.transferring') : t('transactions.transfer')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
