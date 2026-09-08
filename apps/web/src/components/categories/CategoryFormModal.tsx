import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../api/finance';
import { ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import type { Category } from '../../types/api';

type CategoryType = 'income' | 'expense';

/**
 * Create or edit a category (#325).
 *
 * Shared between the Categories screen and the category selector in the
 * transaction dialogs, so "what a category is" is described in one place. When
 * it is opened from a transaction dialog the type is already decided by the
 * transaction, hence `lockedType`.
 */
export function CategoryFormModal({
  hid,
  category,
  lockedType,
  parents,
  onClose,
  onSaved,
}: {
  hid: string;
  /** Editing when present, creating when not. */
  category?: Category;
  /** Fixes the type and hides the selector — used from the transaction dialogs. */
  lockedType?: CategoryType;
  /** Top-level categories offered as a parent. Sub-categories are excluded by the caller. */
  parents: Category[];
  onClose: () => void;
  onSaved: (saved: Category) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isEdit = !!category;

  const [name, setName] = useState(category?.name ?? '');
  const [type, setType] = useState<CategoryType>(
    category?.type ?? lockedType ?? 'expense',
  );
  const [icon, setIcon] = useState(category?.icon ?? '');
  const [parentId, setParentId] = useState(category?.parentId ?? '');
  const [error, setError] = useState<string | null>(null);

  // Only same-type, top-level categories can be a parent — the server enforces
  // both, and offering options it will reject is just a worse error message.
  const parentOptions = parents.filter(
    (c) => c.type === type && !c.parentId && c.id !== category?.id,
  );

  const save = useMutation({
    mutationFn: (): Promise<Category> => {
      const payload = {
        name: name.trim(),
        type,
        icon: icon.trim() || null,
        parentId: parentId || null,
      };
      return isEdit
        ? financeApi.updateCategory(category.id, hid, payload)
        : financeApi.createCategory(hid, payload);
    },
    onSuccess: (saved) => {
      // Prefix key: refreshes both this page's archived-inclusive query and the
      // active-only one the transaction dialogs read.
      qc.invalidateQueries({ queryKey: ['categories', hid] });
      onSaved(saved);
    },
    onError: (err: unknown) => {
      // A duplicate name is the one failure the user can fix in this form, and
      // the server already phrases it well; anything else falls back to the
      // message it sent.
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err),
      );
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    save.mutate();
  };

  return (
    <Modal
      title={isEdit ? t('categoryMgmt.editTitle') : t('categoryMgmt.newTitle')}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={t('categories.name')}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder={t('categoryMgmt.namePlaceholder')}
          required
          autoFocus
        />

        {!lockedType && (
          <Select
            label={t('categories.type')}
            value={type}
            onChange={(e) => {
              setType(e.target.value as CategoryType);
              // The old parent may belong to the other type now.
              setParentId('');
            }}
          >
            <option value="expense">{t('categories.expense')}</option>
            <option value="income">{t('categories.income')}</option>
          </Select>
        )}

        <Input
          label={`${t('categoryMgmt.icon')} (${t('common.optional')})`}
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🛒"
          maxLength={4}
        />

        {parentOptions.length > 0 && (
          <Select
            label={`${t('categoryMgmt.parent')} (${t('common.optional')})`}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">{t('categoryMgmt.noParent')}</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={save.isPending || !name.trim()}
          >
            {save.isPending
              ? t('common.saving')
              : isEdit
                ? t('common.save')
                : t('common.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
