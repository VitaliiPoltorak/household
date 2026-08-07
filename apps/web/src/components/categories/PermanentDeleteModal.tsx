import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../api/finance';
import { ApiError } from '../../api/client';
import { Button } from '../ui/Button';
import type { Category, CategoryImpact } from '../../types/api';

interface Props {
  category: Category;
  householdId: string;
  onClose: () => void;
}

export function PermanentDeleteModal({ category, householdId, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const { data: impact, isLoading, error: impactError } = useQuery({
    queryKey: ['categoryImpact', category.id, householdId],
    queryFn: () => financeApi.getCategoryImpact(category.id, householdId),
    // Fresh fetch every time the modal opens — impact can change between
    // page load and this moment (another user may have added a transaction).
    staleTime: 0,
    gcTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: () => financeApi.permanentlyDeleteCategory(category.id, householdId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories', householdId] });
      onClose();
    },
    // 409 is the "impact grew" case. Update the cached impact so the modal
    // re-renders in blocked state with the authoritative counts from the
    // server. Do NOT close — the user needs to see why the click failed.
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.status === 409 && err.data?.impact) {
        qc.setQueryData<CategoryImpact>(
          ['categoryImpact', category.id, householdId],
          {
            categoryId: category.id,
            lastUsedAt: null,
            ...(err.data.impact as { transactions: number; recurringPayments: number; subcategories: number }),
          },
        );
      }
    },
  });

  const isBlocked =
    !!impact && (impact.transactions + impact.recurringPayments + impact.subcategories) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="permdel-title"
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 id="permdel-title" className="text-base font-semibold text-gray-900">
            {t('categoryMgmt.deletePermanent.title', { name: category.name })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 text-sm text-gray-700 space-y-3">
          {isLoading && <p className="text-gray-500">{t('common.loading')}</p>}

          {impactError && !impact && (
            <p className="text-red-600">{t('common.error')}</p>
          )}

          {impact && !isBlocked && (
            <p>{t('categoryMgmt.deletePermanent.warningEmpty', { name: category.name })}</p>
          )}

          {impact && isBlocked && (
            <>
              <p>{t('categoryMgmt.deletePermanent.warningBlocked')}</p>
              <ul className="list-disc pl-5 text-gray-800">
                {impact.transactions > 0 && (
                  <li>
                    {t('categoryMgmt.deletePermanent.impact.transactions', { count: impact.transactions })}
                  </li>
                )}
                {impact.recurringPayments > 0 && (
                  <li>
                    {t('categoryMgmt.deletePermanent.impact.recurringPayments', { count: impact.recurringPayments })}
                  </li>
                )}
                {impact.subcategories > 0 && (
                  <li>
                    {t('categoryMgmt.deletePermanent.impact.subcategories', { count: impact.subcategories })}
                  </li>
                )}
              </ul>
              <p className="text-xs text-gray-500">{t('categoryMgmt.deletePermanent.reassignSoonHint')}</p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
          {impact && !isBlocked ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={onClose}
                disabled={deleteMutation.isPending}
              >
                {t('categoryMgmt.deletePermanent.cta.cancel')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending
                  ? t('common.saving')
                  : t('categoryMgmt.deletePermanent.cta.delete')}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t('categoryMgmt.deletePermanent.cta.close')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
