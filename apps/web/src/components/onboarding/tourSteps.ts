export interface TourStep {
  id: string;
  // Route the tour navigates to before spotlighting this step's target.
  page: string;
  // Matches a data-tour="<target>" attribute on the real element to
  // spotlight. Empty string means no spotlight — a centered intro/outro card.
  target: string;
  titleKey: string;
  bodyKey: string;
}

/**
 * The guided tour across the app's 5 primary pages (#347). Purely
 * explanatory — no step writes any data; where a page would otherwise show
 * an empty state, it shows one canned example row instead (see
 * OnboardingTourContext's isStepTarget + each page's demo-row branch).
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
    id: 'outro',
    page: '/dashboard',
    target: '',
    titleKey: 'tour.steps.outro.title',
    bodyKey: 'tour.steps.outro.body',
  },
];
