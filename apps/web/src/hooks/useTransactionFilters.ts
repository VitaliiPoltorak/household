import { useCallback, useState } from 'react';

export interface TransactionFilters {
  type: string;
  accountId: string;
  from: string;
  to: string;
}

/**
 * Local filter state for the transactions list. Kept as a hook so the page
 * component doesn't own four independent useState calls and the derived
 * `hasFilters` predicate — and so it's testable in isolation without a
 * full render.
 */
export function useTransactionFilters() {
  const [type, setType] = useState('');
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filters: TransactionFilters = { type, accountId, from, to };
  const hasFilters = !!(type || accountId || from || to);

  const clear = useCallback(() => {
    setType('');
    setAccountId('');
    setFrom('');
    setTo('');
  }, []);

  return { filters, hasFilters, setType, setAccountId, setFrom, setTo, clear };
}
