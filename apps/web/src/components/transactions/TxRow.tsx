import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Transaction } from '../../types/api';
import { Badge } from '../ui/Badge';
import { EditingBadge } from '../presence/EditingBadge';
import { formatMoney } from '../../lib/money';

const fmt = (n: number, currency = 'UAH') => formatMoney(n, currency);

interface Props {
  tx: Transaction;
  accountName: string;
  /** Name of the counter account (only used when tx.type === 'transfer'). */
  counterAccountName?: string | null;
  categoryName: string | null;
  onDelete: () => void;
  onEdit: () => void;
  onDescriptionSave: (desc: string) => void;
}

/**
 * Single transaction row with inline description edit.
 *
 * Transfers (#167) render as ONE row `From X → To Y` — both accounts are
 * shown together, and clicking delete cascades to both legs on the backend.
 */
export function TxRow({
  tx,
  accountName,
  counterAccountName,
  categoryName,
  onDelete,
  onEdit,
  onDescriptionSave,
}: Props) {
  const { t } = useTranslation();
  const isIncome = tx.type === 'income';
  const isExpense = tx.type === 'expense';
  const isTransfer = tx.type === 'transfer';
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(tx.description ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingDesc) inputRef.current?.select();
  }, [editingDesc]);

  const saveDesc = () => {
    if (descVal !== (tx.description ?? '')) onDescriptionSave(descVal);
    setEditingDesc(false);
  };

  const cancelDesc = () => {
    setDescVal(tx.description ?? '');
    setEditingDesc(false);
  };

  // For transfers, the "primary account label" is a From→To pair.
  // Fallback for legacy / half-paired transfers: show just the primary account.
  const transferPairLabel =
    isTransfer && counterAccountName
      ? t('transactions.transferPair', {
          from: accountName,
          to: counterAccountName,
        })
      : accountName;

  return (
    <div className="group flex items-center gap-4 px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge label={tx.type} />
          {editingDesc ? (
            <input
              ref={inputRef}
              value={descVal}
              onChange={(e) => setDescVal(e.target.value)}
              onBlur={saveDesc}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveDesc();
                if (e.key === 'Escape') cancelDesc();
              }}
              className="flex-1 rounded border border-primary-400 bg-white px-1 text-sm text-gray-700 focus:outline-none dark:bg-gray-800 dark:text-gray-200"
            />
          ) : (
            <span
              className="cursor-text truncate text-sm text-gray-700 dark:text-gray-300"
              onDoubleClick={() => setEditingDesc(true)}
              title="Double-click to edit description"
            >
              {tx.description ?? transferPairLabel}
            </span>
          )}
          {categoryName && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              · {categoryName}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
          <span className="font-mono">{tx.date}</span> · {transferPairLabel}
        </p>
        <EditingBadge entity="transaction" entityId={tx.id} />
      </div>

      <span
        className={`whitespace-nowrap font-mono font-semibold ${
          isIncome
            ? 'text-green-600 dark:text-green-400'
            : isExpense
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-700 dark:text-gray-300'
        }`}
      >
        {isExpense ? '−' : isIncome ? '+' : ''}
        {fmt(Number(tx.amount), tx.currency)}
      </span>

      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onEdit}
          className="text-sm text-gray-300 hover:text-primary-500 dark:text-gray-600 dark:hover:text-primary-400"
          title="Edit"
        >
          ✏️
        </button>
        <button
          onClick={onDelete}
          className="text-sm text-gray-300 hover:text-red-400 dark:text-gray-600 dark:hover:text-red-400"
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
