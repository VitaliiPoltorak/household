import type { TFunction } from 'i18next';
import { td } from './i18n-dynamic';
import type { EnabledAccountType } from '../types/api';

/**
 * Display name for an account type.
 *
 * Seeded system types have a translation under `accounts.types.<code>`; a
 * household's own type (added via "+ Add a type…", #227) has only the label
 * the user typed, which is then the only sensible thing to show. Falling back
 * to the raw code is the last resort, for a type that has somehow gone missing
 * from the enabled list.
 *
 * Shared between the accounts screen's badges and the dashboard's wealth
 * breakdown (#332). The dashboard used to pass the raw key straight through as
 * a label, which leaked "bank" / "cash" into the product surface, stayed
 * English under every locale, and was simply wrong for custom types.
 */
export function accountTypeLabel(
  code: string,
  enabledTypes: EnabledAccountType[],
  t: TFunction,
): string {
  const match = enabledTypes.find((et) => et.typeCode === code);
  return td(t, `accounts.types.${code}`, {
    defaultValue: match?.accountType?.label ?? code,
  });
}
