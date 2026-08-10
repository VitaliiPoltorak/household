import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { financeApi } from '../../api/finance';
import type { Account } from '../../types/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

interface Props {
  hid: string;
  accounts: Account[];
  onClose: () => void;
  onCreated: () => void;
}

/** Create a two-leg transfer between two of the household's accounts. */
export function TransferModal({ hid, accounts, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [fromId, setFromId] = useState(accounts[0]?.id ?? '');
  const [toId, setToId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await financeApi.createTransfer(hid, {
        fromAccountId: fromId,
        toAccountId: toId,
        amount: parseFloat(amount),
        currency: accounts.find((a) => a.id === fromId)?.currency ?? 'UAH',
        date,
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('transactions.transferTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Select label={t('transactions.from')} value={fromId}
          onChange={(e) => setFromId(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select label={t('transactions.to')} value={toId}
          onChange={(e) => setToId(e.target.value)}>
          {accounts.filter((a) => a.id !== fromId).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Input label={t('transactions.amount')} type="number" step="0.01" min="0.01"
          value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
        <Input label={t('transactions.date')} type="date" value={date}
          onChange={(e) => setDate(e.target.value)} required />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1"
            disabled={saving || !amount || fromId === toId}>
            {saving ? t('transactions.transferring') : t('transactions.transfer')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
