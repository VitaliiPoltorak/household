import { useState } from 'react';
import type { Category } from '../api/types';
import { parentOptions } from '../lib/categories';
import { Chips } from './Chips';
import { ErrorText } from './ErrorText';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';

const NO_PARENT = '';

export interface CategoryFormValues {
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  parentId?: string;
}

export function CategoryForm({
  category,
  categories,
  submitLabel,
  error,
  busy,
  onSubmit,
}: {
  /** Present when editing; absent when creating. */
  category?: Category;
  /** Every household category, used to offer parents. */
  categories: Category[];
  submitLabel: string;
  error: string;
  busy: boolean;
  onSubmit: (values: CategoryFormValues) => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [type, setType] = useState<'income' | 'expense'>(
    category?.type ?? 'expense',
  );
  const [icon, setIcon] = useState(category?.icon ?? '');
  const [parentId, setParentId] = useState(category?.parentId ?? NO_PARENT);
  const [localError, setLocalError] = useState('');

  const parents = parentOptions(categories, type, category?.id);
  // A category that already has children cannot itself become a sub-category.
  const hasChildren =
    !!category && categories.some((c) => c.parentId === category.id);
  // The saved parent may have been archived since; keep it visible and selected.
  const saved = categories.find((c) => c.id === category?.parentId);
  const parentChoices =
    saved && !parents.some((p) => p.id === saved.id) ? [...parents, saved] : parents;

  const submit = () => {
    if (!name.trim()) {
      setLocalError('Enter a name.');
      return;
    }
    setLocalError('');
    onSubmit({
      name: name.trim(),
      type,
      ...(icon.trim() ? { icon: icon.trim() } : {}),
      // On edit an empty string un-parents (the server maps a falsy parentId to null).
      ...(hasChildren || (parentId === NO_PARENT && !category?.parentId)
        ? {}
        : { parentId }),
    });
  };

  return (
    <>
      <ErrorText message={localError || error} />
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="sentences"
      />
      {/* Changing the type of a used category would silently re-classify its history. */}
      {category ? null : (
        <Chips
          label="Type"
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
          value={type}
          onChange={(v) => {
            setType(v as 'income' | 'expense');
            setParentId(NO_PARENT);
          }}
        />
      )}
      <TextField
        label="Icon (optional emoji)"
        value={icon}
        onChangeText={setIcon}
        autoCapitalize="none"
        maxLength={8}
      />
      {hasChildren || parentChoices.length === 0 ? null : (
        <Chips
          label="Parent category"
          options={[
            { value: NO_PARENT, label: 'None' },
            ...parentChoices.map((p) => ({ value: p.id, label: p.name })),
          ]}
          value={parentId}
          onChange={setParentId}
        />
      )}
      <PrimaryButton label={submitLabel} onPress={submit} loading={busy} />
    </>
  );
}
