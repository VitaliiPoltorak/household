import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../api/finance';
import { useHousehold } from '../contexts/HouseholdContext';
import { Button } from '../components/ui/Button';
import { PermanentDeleteModal } from '../components/categories/PermanentDeleteModal';
import type { Category } from '../types/api';

const EMPTY: Category[] = [];

export function CategoriesPage() {
  const { t } = useTranslation();
  const { activeHousehold } = useHousehold();
  const hid = activeHousehold?.id;
  const qc = useQueryClient();

  const [confirmArchive, setConfirmArchive] = useState<Category | null>(null);
  const [permanentTarget, setPermanentTarget] = useState<Category | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Single request fetches everything; toggle only controls what we render.
  // Keeps invalidation trivial and avoids two parallel queries drifting.
  const { data: all = EMPTY, isLoading } = useQuery({
    queryKey: ['categories', hid, { includeArchived: true }],
    queryFn: () => financeApi.getCategories(hid!, undefined, true),
    enabled: !!hid,
  });

  const invalidate = () => {
    // Invalidate BOTH the archived-inclusive key used by this page AND the
    // active-only key that TransactionsPage / AccountsPage consume, so dropdowns
    // there refresh after archive/unarchive.
    qc.invalidateQueries({ queryKey: ['categories', hid] });
  };

  const archiveMutation = useMutation({
    mutationFn: (id: string) => financeApi.deleteCategory(id, hid!),
    onSuccess: () => { setConfirmArchive(null); invalidate(); },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => financeApi.unarchiveCategory(id, hid!),
    onSuccess: invalidate,
  });

  const { active, archived } = useMemo(() => {
    return {
      active: all.filter(c => !c.isArchived),
      archived: all.filter(c => c.isArchived),
    };
  }, [all]);

  const byType = (list: Category[]) => ({
    income: list.filter(c => c.type === 'income'),
    expense: list.filter(c => c.type === 'expense'),
  });
  const activeByType = byType(active);

  if (!hid) {
    return <div className="text-sm text-gray-500">{t('common.selectHousehold')}</div>;
  }

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">{t('categoryMgmt.title')}</h1>

      {isLoading ? (
        <div className="text-sm text-gray-500">{t('common.loading')}</div>
      ) : (
        <>
          <ActiveSection
            title={t('categoryMgmt.active')}
            expense={activeByType.expense}
            income={activeByType.income}
            onArchive={(cat) => setConfirmArchive(cat)}
            emptyLabel={t('categoryMgmt.empty.active')}
          />

          <ArchivedSection
            expanded={showArchived}
            onToggle={() => setShowArchived(v => !v)}
            items={archived}
            emptyLabel={t('categoryMgmt.empty.archived')}
            onUnarchive={(id) => unarchiveMutation.mutate(id)}
            onPermanentDelete={(cat) => setPermanentTarget(cat)}
            unarchivingId={unarchiveMutation.isPending ? unarchiveMutation.variables ?? null : null}
          />
        </>
      )}

      {confirmArchive && (
        <ConfirmDialog
          title={t('categoryMgmt.confirm.archiveTitle')}
          body={t('categoryMgmt.confirm.archiveBody', { name: confirmArchive.name })}
          confirmLabel={t('categoryMgmt.actions.archive')}
          onCancel={() => setConfirmArchive(null)}
          onConfirm={() => archiveMutation.mutate(confirmArchive.id)}
          confirming={archiveMutation.isPending}
        />
      )}

      {permanentTarget && (
        <PermanentDeleteModal
          category={permanentTarget}
          householdId={hid}
          onClose={() => setPermanentTarget(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────
// Sections
// ────────────────────────────────────────────────
function ActiveSection({
  title, expense, income, onArchive, emptyLabel,
}: {
  title: string;
  expense: Category[];
  income: Category[];
  onArchive: (cat: Category) => void;
  emptyLabel: string;
}) {
  const { t } = useTranslation();
  const total = expense.length + income.length;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title} <span className="text-gray-400">({total})</span>
      </h2>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-4">
          {expense.length > 0 && (
            <TypeGroup label={t('categories.expense')} items={expense} onArchive={onArchive} />
          )}
          {income.length > 0 && (
            <TypeGroup label={t('categories.income')} items={income} onArchive={onArchive} />
          )}
        </div>
      )}
    </section>
  );
}

function TypeGroup({
  label, items, onArchive,
}: {
  label: string;
  items: Category[];
  onArchive: (cat: Category) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-gray-500">{label}</div>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {items.map(cat => (
          <li key={cat.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              {cat.icon && <span aria-hidden>{cat.icon}</span>}
              <span className="text-sm text-gray-900">{cat.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => onArchive(cat)}>
                {t('categoryMgmt.actions.archive')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArchivedSection({
  expanded, onToggle, items, emptyLabel, onUnarchive, onPermanentDelete, unarchivingId,
}: {
  expanded: boolean;
  onToggle: () => void;
  items: Category[];
  emptyLabel: string;
  onUnarchive: (id: string) => void;
  onPermanentDelete: (cat: Category) => void;
  unarchivingId: string | null;
}) {
  const { t } = useTranslation();

  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between border-b border-gray-100 pb-2 text-left"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t('categoryMgmt.archived')} <span className="text-gray-400">({items.length})</span>
        </h2>
        <span className="text-gray-400" aria-hidden>{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        items.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
            {emptyLabel}
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {items.map(cat => (
              <li key={cat.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  {cat.icon && <span aria-hidden>{cat.icon}</span>}
                  <span className="text-sm text-gray-500 line-through">{cat.name}</span>
                  <span className="text-xs uppercase text-gray-400">{t(`categories.${cat.type}`)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={unarchivingId === cat.id}
                    onClick={() => onUnarchive(cat.id)}
                  >
                    {t('categoryMgmt.actions.unarchive')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onPermanentDelete(cat)}
                  >
                    {t('categoryMgmt.actions.deletePermanent')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

// ────────────────────────────────────────────────
// Confirm dialog
// ────────────────────────────────────────────────
function ConfirmDialog({
  title, body, confirmLabel, onCancel, onConfirm, confirming,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        </div>
        <div className="px-6 py-4 text-sm text-gray-700">{body}</div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
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
