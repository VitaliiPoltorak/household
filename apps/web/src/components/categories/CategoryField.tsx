import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '../ui/Input';
import { CategoryFormModal } from './CategoryFormModal';
import type { Category } from '../../types/api';

// Sentinel <option> value that opens the create form instead of being a real
// selection — same shape as AccountsPage's "+ Add a type…" affordance.
const ADD_CATEGORY_VALUE = '__add_category__';

/**
 * Category selector for the transaction dialogs (#325).
 *
 * Deliberately always rendered, even when the household has no categories of
 * this type. Hiding the field when the list was empty is half of what made
 * categories unreachable: nothing in the product ever mentioned that
 * categories existed, so there was no reason to go looking for the screen that
 * creates them. Now the empty case is exactly where the way out is offered.
 */
export function CategoryField({
  hid,
  label,
  categories,
  type,
  value,
  onChange,
}: {
  hid: string;
  label: string;
  /** Active categories for the household — filtered to `type` here. */
  categories: Category[];
  /** Transaction type the category must match. Empty while the user has not picked one. */
  type: 'income' | 'expense' | '';
  value: string;
  onChange: (categoryId: string) => void;
}) {
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  // A category created from here is selected immediately, but the list this
  // component is given only refreshes when the parent's query refetches. A
  // <select> whose value is not among its options renders blank, so the new
  // one is held here until the refetch catches up — the same defence
  // AccountTypeField applies to account types.
  const [justCreated, setJustCreated] = useState<Category | null>(null);

  const known = type ? categories.filter((c) => c.type === type) : [];
  const options =
    justCreated && !known.some((c) => c.id === justCreated.id)
      ? [...known, justCreated]
      : known;

  return (
    <>
      <Select
        label={label}
        value={value}
        onChange={(e) => {
          if (e.target.value === ADD_CATEGORY_VALUE) {
            setShowCreate(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        <option value="">{t('transactions.noCategory')}</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon ? `${c.icon} ${c.name}` : c.name}
          </option>
        ))}
        {/* Offered only once the type is known, since a category belongs to one. */}
        {type && <option value={ADD_CATEGORY_VALUE}>{t('categoryMgmt.new')}</option>}
      </Select>

      {showCreate && type && (
        <CategoryFormModal
          hid={hid}
          lockedType={type}
          parents={categories}
          onClose={() => setShowCreate(false)}
          onSaved={(saved) => {
            // Select what was just created — the user made it in order to use it.
            setJustCreated(saved);
            onChange(saved.id);
            setShowCreate(false);
          }}
        />
      )}
    </>
  );
}
