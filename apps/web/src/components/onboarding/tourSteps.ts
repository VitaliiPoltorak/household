export interface TourStep {
  id: string;
  // Route this step's target lives on. For an `interactive` step this is
  // the CURRENT page (the nav link being spotlighted is reachable from
  // anywhere) — OnboardingContext only force-navigates for non-interactive
  // steps; interactive ones wait for the real click instead.
  page: string;
  // Matches a data-tour="<target>" attribute on the real element to
  // spotlight. Empty string means no spotlight — a centered intro/outro card.
  target: string;
  titleKey: string;
  bodyKey: string;
  // True for a "click here to continue" step: the spotlighted element (a
  // real nav link) stays genuinely clickable through the dim overlay, and
  // the tour advances itself once the route actually changes — no Next
  // button. Keeps page transitions an explicit user action instead of the
  // tour silently teleporting them (#347 review feedback).
  interactive?: boolean;
}

/**
 * The guided tour across the app's 5 primary pages (#347). Purely
 * explanatory — no step writes any data; where a page would otherwise show
 * an empty state, it shows one canned example row instead (see
 * OnboardingContext's isStepTarget + each page's demo-row branch).
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'intro',
    page: '/dashboard',
    target: '',
    titleKey: 'tour.steps.intro.title',
    bodyKey: 'tour.steps.intro.body',
  },
  {
    id: 'dashboard-stats',
    page: '/dashboard',
    target: 'dashboard-stats',
    titleKey: 'tour.steps.dashboardStats.title',
    bodyKey: 'tour.steps.dashboardStats.body',
  },
  {
    id: 'nav-to-accounts',
    page: '/dashboard',
    target: 'nav-accounts',
    titleKey: 'tour.steps.navToAccounts.title',
    bodyKey: 'tour.steps.navToAccounts.body',
    interactive: true,
  },
  {
    id: 'accounts-new',
    page: '/accounts',
    target: 'accounts-new-btn',
    titleKey: 'tour.steps.accountsNew.title',
    bodyKey: 'tour.steps.accountsNew.body',
  },
  {
    id: 'accounts-list',
    page: '/accounts',
    target: 'accounts-list',
    titleKey: 'tour.steps.accountsList.title',
    bodyKey: 'tour.steps.accountsList.body',
  },
  {
    id: 'nav-to-transactions',
    page: '/accounts',
    target: 'nav-transactions',
    titleKey: 'tour.steps.navToTransactions.title',
    bodyKey: 'tour.steps.navToTransactions.body',
    interactive: true,
  },
  {
    id: 'tx-new',
    page: '/transactions',
    target: 'tx-new-btn',
    titleKey: 'tour.steps.txNew.title',
    bodyKey: 'tour.steps.txNew.body',
  },
  {
    id: 'tx-transfer',
    page: '/transactions',
    target: 'tx-transfer-btn',
    titleKey: 'tour.steps.txTransfer.title',
    bodyKey: 'tour.steps.txTransfer.body',
  },
  {
    id: 'tx-filters',
    page: '/transactions',
    target: 'tx-filters',
    titleKey: 'tour.steps.txFilters.title',
    bodyKey: 'tour.steps.txFilters.body',
  },
  {
    id: 'nav-to-shopping',
    page: '/transactions',
    target: 'nav-shopping',
    titleKey: 'tour.steps.navToShopping.title',
    bodyKey: 'tour.steps.navToShopping.body',
    interactive: true,
  },
  {
    id: 'shopping-new',
    page: '/shopping',
    target: 'shopping-new-btn',
    titleKey: 'tour.steps.shoppingNew.title',
    bodyKey: 'tour.steps.shoppingNew.body',
  },
  {
    id: 'shopping-list',
    page: '/shopping',
    target: 'shopping-list',
    titleKey: 'tour.steps.shoppingList.title',
    bodyKey: 'tour.steps.shoppingList.body',
  },
  {
    id: 'nav-to-household',
    page: '/shopping',
    target: 'nav-household',
    titleKey: 'tour.steps.navToHousehold.title',
    bodyKey: 'tour.steps.navToHousehold.body',
    interactive: true,
  },
  {
    id: 'household-invite',
    page: '/household',
    target: 'household-invite-btn',
    titleKey: 'tour.steps.householdInvite.title',
    bodyKey: 'tour.steps.householdInvite.body',
  },
  {
    id: 'household-members',
    page: '/household',
    target: 'household-members',
    titleKey: 'tour.steps.householdMembers.title',
    bodyKey: 'tour.steps.householdMembers.body',
  },
  {
    id: 'nav-to-dashboard',
    page: '/household',
    target: 'nav-dashboard',
    titleKey: 'tour.steps.navToDashboard.title',
    bodyKey: 'tour.steps.navToDashboard.body',
    interactive: true,
  },
  {
    id: 'outro',
    page: '/dashboard',
    target: '',
    titleKey: 'tour.steps.outro.title',
    bodyKey: 'tour.steps.outro.body',
  },
];
