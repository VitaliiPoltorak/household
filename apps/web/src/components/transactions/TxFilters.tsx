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

const CONTROL =
  'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

/** Filter bar above the transactions list. Pure controlled component. */
export function TxFilters({
  accounts, filterType, filterAccountId, from, to, hasFilters,
  onTypeChange, onAccountChange, onFromChange, onToChange, onClear,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <select value={filterType} onChange={(e) => onTypeChange(e.target.value)} className={CONTROL}>
        <option value="">{t('transactions.allTypes')}</option>
        {['income', 'expense', 'transfer', 'adjustment'].map((tp) => (
          <option key={tp} value={tp}>{t(`transactions.types.${tp}` as never)}</option>
        ))}
      </select>
      <select value={filterAccountId} onChange={(e) => onAccountChange(e.target.value)} className={CONTROL}>
        <option value="">{t('transactions.allAccounts')}</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <input
        type="date"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        className={CONTROL}
        title={t('transactions.fromDate')}
      />
      <input
        type="date"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        className={CONTROL}
        title={t('transactions.toDate')}
      />
      {hasFilters && (
        <button
          onClick={onClear}
          className="text-sm text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
        >
          {t('transactions.clearFilters')}
        </button>
      )}
    </div>
  );
}
