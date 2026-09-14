import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge';

/**
 * Canned "Example" rows shown in place of a page's real empty state while
 * the tour is spotlighting that page (#347). Hardcoded content only — the
 * tour never types or persists anything, see OnboardingContext.
 */
export function DemoAccountRow() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
      <div>
        <p className="font-medium text-gray-900 dark:text-gray-100">
          {t('tour.demo.accountName')}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('tour.demo.accountBalance')}
        </p>
      </div>
      <Badge label={t('tour.demo.badge')} />
    </div>
  );
}

export function DemoTransactionRow() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
      <div>
        <p className="font-medium text-gray-900 dark:text-gray-100">
          {t('tour.demo.txDescription')}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('tour.demo.txAmount')}
        </p>
      </div>
      <Badge label={t('tour.demo.badge')} />
    </div>
  );
}

export function DemoListRow() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
      <div>
        <p className="font-medium text-gray-900 dark:text-gray-100">
          {t('tour.demo.listName')}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('tour.demo.listItems')}
        </p>
      </div>
      <Badge label={t('tour.demo.badge')} />
    </div>
  );
}
