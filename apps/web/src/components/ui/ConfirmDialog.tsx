import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

/**
 * Blocking confirmation for a destructive action (#327).
 *
 * Extracted from CategoriesPage, where it had lived as a private component
 * while transactions — the actual financial records — were deleted by a bare
 * ✕ with nothing in between. Shared so that "how do we ask before destroying
 * something" is answered once: past audits kept finding rules applied in one
 * place and missed everywhere else.
 *
 * `details` is for naming the specific thing being removed. A confirmation
 * that only says "are you sure?" trains people to click through it; one that
 * shows the amount, account and date gives them something to actually check.
 */
export function ConfirmDialog({
  title,
  body,
  details,
  confirmLabel,
  onCancel,
  onConfirm,
  confirming,
}: {
  title: string;
  body: string;
  /** Optional summary of the record itself, rendered above the buttons. */
  details?: ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/60"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        </div>
        <div className="space-y-3 px-6 py-4 text-sm text-gray-700 dark:text-gray-200">
          <p>{body}</p>
          {details}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3 dark:border-gray-800">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={confirming}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={confirming}>
            {confirming ? t('common.saving') : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
