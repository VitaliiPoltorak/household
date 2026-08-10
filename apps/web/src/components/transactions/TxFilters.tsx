import { useTranslation } from 'react-i18next';
import type { Account } from '../../types/api';

interface Props {
  accounts: Account[];
  filterType: string;
  filterAccountId: string;
  from: string;
  to: string;
  hasFilters: boolean;
  onTypeChange: (v: string) => void;
  onAccountChange: (v: string) => void;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear: () => void;
}

/** Filter bar above the transactions list. Pure controlled component. */
export function TxFilters({
  accounts, filterType, filterAccountId, from, to, hasFilters,
  onTypeChange, onAccountChange, onFromChange, onToChange, onClear,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <select value={filterType} onChange={(e) => onTypeChange(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
        <option value="">{t('transactions.allTypes')}</option>
        {['income', 'expense', 'transfer', 'adjustment'].map((tp) => (
          <option key={tp} value={tp}>{t(`transactions.types.${tp}` as never)}</option>
        ))}
      </select>
      <select value={filterAccountId} onChange={(e) => onAccountChange(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
        <option value="">{t('transactions.allAccounts')}</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        title={t('transactions.fromDate')} />
      <input type="date" value={to} onChange={(e) => onToChange(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        title={t('transactions.toDate')} />
      {hasFilters && (
        <button
          onClick={onClear}
          className="text-sm text-gray-400 hover:text-gray-700"
        >
          {t('transactions.clearFilters')}
        </button>
      )}
    </div>
  );
}
