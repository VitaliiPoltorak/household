import { useEffect, useRef, useState } from 'react';
import type { Transaction } from '../../types/api';
import { Badge } from '../ui/Badge';
import { EditingBadge } from '../presence/EditingBadge';

function fmt(n: number, currency = 'UAH') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}

interface Props {
  tx: Transaction;
  accountName: string;
  categoryName: string | null;
  onDelete: () => void;
  onEdit: () => void;
  onDescriptionSave: (desc: string) => void;
}

/** Single transaction row with inline description edit. */
export function TxRow({ tx, accountName, categoryName, onDelete, onEdit, onDescriptionSave }: Props) {
  const isIncome = tx.type === 'income';
  const isExpense = tx.type === 'expense';
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

  return (
    <div className="flex items-center gap-4 px-5 py-3 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
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
              className="flex-1 rounded border border-primary-400 px-1 text-sm text-gray-700 focus:outline-none"
            />
          ) : (
            <span
              className="text-sm text-gray-700 truncate cursor-text"
              onDoubleClick={() => setEditingDesc(true)}
              title="Double-click to edit description"
            >
              {tx.description ?? accountName}
            </span>
          )}
          {categoryName && <span className="text-xs text-gray-400">· {categoryName}</span>}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{tx.date} · {accountName}</p>
        <EditingBadge entity="transaction" entityId={tx.id} />
      </div>

      <span className={`font-semibold whitespace-nowrap ${isIncome ? 'text-green-600' : isExpense ? 'text-red-600' : 'text-gray-700'}`}>
        {isExpense ? '−' : isIncome ? '+' : ''}{fmt(Number(tx.amount), tx.currency)}
      </span>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onEdit} className="text-gray-300 hover:text-primary-500 text-sm" title="Edit">✏️</button>
        <button onClick={onDelete} className="text-gray-300 hover:text-red-400 text-sm" title="Delete">✕</button>
      </div>
    </div>
  );
}
