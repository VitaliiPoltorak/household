import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { householdsApi } from '../../api/households';
import { useAsyncSubmit } from '../../hooks/useAsyncSubmit';
import { FormError } from '../ui/FormError';
import type { Household } from '../../types/api';

/**
 * First dialog a brand-new user meets — reached from both the dashboard's
 * "create your first home" empty state and the "+ New home" action.
 *
 * That placement is why two bugs here mattered more than their size suggests:
 * a failure was silent (#330), and every string was a hardcoded English
 * literal while the page around it was translated (#331).
 */
export function CreateHouseholdModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (h: Household) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const { submitting, error, setError, run } = useAsyncSubmit();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void run(async () => {
      const h = await householdsApi.create(name.trim());
      onCreate(h);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('household.createTitle')}
        </h2>
        <form onSubmit={submit} className="space-y-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder={t('household.namePlaceholder')}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          />

          {/* The typed name is deliberately kept on failure — retyping it is
              the last thing a user wants after a request they did not see
              fail. */}
          <FormError message={error} />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 dark:bg-primary-600 dark:hover:bg-primary-500"
            >
              {submitting ? t('common.saving') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
