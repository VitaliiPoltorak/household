import { useTranslation } from 'react-i18next';
import {
  HomeIcon,
  BillIcon,
  TxIcon,
  ListIcon,
  MembersIcon,
} from '../brand/icons';

export interface NavItem {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

/**
 * The five primary destinations, shared by Sidebar (desktop) and
 * MobileTabBar (mobile) so they can't drift apart into two different navs.
 */
export function usePrimaryNav(): NavItem[] {
  const { t } = useTranslation();
  return [
    { to: '/dashboard', label: t('nav.dashboard'), Icon: HomeIcon },
    { to: '/accounts', label: t('nav.accounts'), Icon: BillIcon },
    { to: '/transactions', label: t('nav.transactions'), Icon: TxIcon },
    { to: '/shopping', label: t('nav.shopping'), Icon: ListIcon },
    { to: '/household', label: t('nav.household'), Icon: MembersIcon },
  ];
}
