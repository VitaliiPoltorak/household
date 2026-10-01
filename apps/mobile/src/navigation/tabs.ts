import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface TabDef {
  /** File name under app/(app)/ — also the route name. */
  name: string;
  title: string;
  icon: IconName;
}

/**
 * Top-level sections, mirroring web's primary nav (usePrimaryNav in
 * apps/web/src/components/layout). Net worth is not a tab yet — it lands
 * with its own screen task under #28. Titles are English literals until
 * mobile i18n (libs/locales) is wired up.
 */
export const TABS: TabDef[] = [
  { name: 'dashboard', title: 'Dashboard', icon: 'home-outline' },
  { name: 'accounts', title: 'Accounts', icon: 'card-outline' },
  {
    name: 'transactions',
    title: 'Transactions',
    icon: 'swap-horizontal-outline',
  },
  { name: 'shopping', title: 'Shopping', icon: 'cart-outline' },
  { name: 'household', title: 'Household', icon: 'people-outline' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline' },
];
