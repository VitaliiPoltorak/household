import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { financeApi } from '../api/finance';
import type { Account } from '../types/api';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';

const ACCOUNT_TYPES = ['cash', 'bank', 'crypto', 'investment', 'deposit'] as const;
const CURRENCIES = ['UAH', 'USD', 'EUR'];

function fmt(n: number, currency = 'UAH') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}

export function AccountsPage() {
  const { t } = useTranslation();
  const { activeHousehold } = useHousehold();
  const qc = useQueryClient();
  const hid = activeHousehold?.id ?? '';
  const [showCreate, setShowCreate] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', hid],
    queryFn: () => financeApi.getAccounts(hid),
    enabled: !!hid,
  });

  const archive = useMutation({
    mutationFn: (id: string) => financeApi.archiveAccount(id, hid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts', hid] }),
  });

  const total = accounts.reduce((s, a) => s + Number(a.balance), 0);

  if (!activeHousehold) return <p className="text-gray-500">{t('common.selectHousehold')}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('accounts.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('accounts.total')}: <span className="font-semibold text-gray-800">{fmt(total)}</span>
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>{t('accounts.new')}</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <Empty
          text={t('accounts.empty')}
          action={() => setShowCreate(true)}
          actionLabel={t('accounts.addFirst')}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              archiveLabel={t('common.archive')}
              onArchive={() => archive.mutate(a.id)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateAccountModal
          hid={hid}
          onClose={() => setShowCreate(false)}
          onCreated={() => { qc.invalidateQueries({ queryKey: ['accounts', hid] }); setShowCreate(false); }}
        />
      )}
    </div>
  );
}

function AccountCard({ account, archiveLabel, onArchive }: {
  account: Account;
  archiveLabel: string;
  onArchive: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <Badge label={account.type} />
          <p className="mt-2 font-semibold text-gray-900">{account.name}</p>
        </div>
        <button onClick={onArchive} className="text-gray-300 hover:text-red-400 text-lg" title={archiveLabel}>🗑</button>
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-800">
        {fmt(Number(account.balance), account.currency)}
      </p>
    </div>
  );
}

function CreateAccountModal({ hid, onClose, onCreated }: {
  hid: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('bank');
  const [currency, setCurrency] = useState('UAH');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await financeApi.createAccount(hid, { name: name.trim(), type, currency });
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <Modal title={t('accounts.newTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={t('accounts.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('accounts.namePlaceholder')}
          required
        />
        <Select label={t('accounts.type')} value={type} onChange={(e) => setType(e.target.value)}>
          {ACCOUNT_TYPES.map((tp) => (
            <option key={tp} value={tp}>{t(`accounts.types.${tp}`)}</option>
          ))}
        </Select>
        <Select label={t('accounts.currency')} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? t('common.saving') : t('common.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Spinner() {
  return <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />;
}

function Empty({ text, action, actionLabel }: { text: string; action?: () => void; actionLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <p className="mb-3">{text}</p>
      {action && actionLabel && (
        <Button variant="secondary" size="sm" onClick={action}>{actionLabel}</Button>
      )}
    </div>
  );
}
