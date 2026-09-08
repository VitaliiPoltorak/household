import { useTranslation } from 'react-i18next';
import type { Transaction } from '../../types/api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { formatMoney } from '../../lib/money';
import { formatDate } from '../../lib/date-format';

/**
 * Confirmation for deleting a transaction (#327).
 *
 * The row's ✕ used to call the mutation directly: one mis-click permanently
 * destroyed a financial record and silently rewrote the account balance, with
 * the ✕ sitting next to the edit pencil in a compact row. Categories — the
 * labels — already had more protection than the records they label.
 *
 * The dialog restates the record rather than only asking "are you sure?".
 * Amount, account, date and description are what a user needs to tell one
 * grocery expense from another, and a confirmation they cannot check is one
 * they learn to click through.
 */
export function DeleteTxConfirm({
  tx,
  accountName,
  counterAccountName,
  deleting,
  onCancel,
  onConfirm,
}: {
  tx: Transaction;
  accountName: string;
  counterAccountName: string | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const isTransfer = tx.type === 'transfer';

  const accountLabel =
    isTransfer && counterAccountName
      ? t('transactions.transferPair', { from: accountName, to: counterAccountName })
      : accountName;

  return (
    <ConfirmDialog
      title={t('transactions.deleteTitle')}
      body={t('transactions.deleteBody')}
      confirmLabel={t('common.delete')}
      confirming={deleting}
      onCancel={onCancel}
      onConfirm={onConfirm}
      details={
        <>
          <dl className="rounded-lg bg-gray-50 px-4 py-3 text-sm dark:bg-gray-800">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400">{t('transactions.type')}</dt>
              <dd className="text-gray-900 dark:text-gray-100">
                {t(`transactions.types.${tx.type}` as never)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400">{t('transactions.amount')}</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                {formatMoney(Number(tx.amount), tx.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400">{t('transactions.account')}</dt>
              <dd className="min-w-0 truncate text-gray-900 dark:text-gray-100">{accountLabel}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400">{t('transactions.date')}</dt>
              <dd className="text-gray-900 dark:text-gray-100">{formatDate(tx.date)}</dd>
            </div>
            {tx.description && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">
                  {t('transactions.description')}
                </dt>
                <dd className="min-w-0 truncate text-gray-900 dark:text-gray-100">
                  {tx.description}
                </dd>
              </div>
            )}
          </dl>
          {isTransfer && (
            // Deleting one leg cascades to the other on the backend, which is
            // not something the single collapsed row makes obvious.
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('transactions.deleteTransferNote')}
            </p>
          )}
        </>
      }
    />
  );
}
