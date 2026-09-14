import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Link, useLocation } from 'react-router-dom';
import { renderWithProviders } from './wrapper';
import { server } from './setup';
import { MOCK_USER } from './handlers';
import { useOnboarding } from '../contexts/OnboardingContext';
import { TOUR_STEPS } from '../components/onboarding/tourSteps';

const BASE = '/api/v1';

/** Exercises the (i) re-entry path without depending on Header's markup. */
function ReopenHarness() {
  const { openManually } = useOnboarding();
  return <button onClick={openManually}>reopen</button>;
}

/** Renders the current MemoryRouter location so tests can assert navigation. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/** Stand-in for Sidebar/MobileTabBar's real nav links — the tour spotlights
 * and clicks these directly on interactive steps, same data-tour ids. */
function NavStub() {
  return (
    <nav>
      <Link data-tour="nav-dashboard" to="/dashboard">
        Dashboard
      </Link>
      <Link data-tour="nav-accounts" to="/accounts">
        Accounts
      </Link>
      <Link data-tour="nav-transactions" to="/transactions">
        Transactions
      </Link>
      <Link data-tour="nav-shopping" to="/shopping">
        Shopping
      </Link>
      <Link data-tour="nav-household" to="/household">
        Household
      </Link>
    </nav>
  );
}

function mockMe(onboardingStatus: string) {
  server.use(
    http.get(`${BASE}/auth/me`, () =>
      HttpResponse.json({ ...MOCK_USER, onboardingStatus }),
    ),
  );
}

/** Captures every PATCH /auth/me body sent during a test. */
function capturePatches() {
  const bodies: unknown[] = [];
  server.use(
    http.patch(`${BASE}/auth/me`, async ({ request }) => {
      const body = await request.json();
      bodies.push(body);
      return HttpResponse.json({ ...MOCK_USER, ...(body as object) });
    }),
  );
  return bodies;
}

const NAV_LABEL: Record<string, string> = {
  'nav-dashboard': 'Dashboard',
  'nav-accounts': 'Accounts',
  'nav-transactions': 'Transactions',
  'nav-shopping': 'Shopping',
  'nav-household': 'Household',
};

/** Advances the tour past whatever step is currently showing: clicks the
 * real nav link for an interactive step, or Next/Finish otherwise. Lets the
 * target-search retry loop (up to ~1s per targeted step) flush via fake
 * timers rather than waiting on it for real. */
async function advancePastStep(step: (typeof TOUR_STEPS)[number]) {
  if (step.interactive) {
    fireEvent.click(screen.getByText(NAV_LABEL[step.target]));
  } else {
    const button = screen.queryByText('Finish') ?? screen.getByText('Next');
    fireEvent.click(button);
  }
  await vi.advanceTimersByTimeAsync(1100);
}

describe('Onboarding tour (#347)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-opens on the intro step when onboardingStatus is pending', async () => {
    mockMe('pending');
    renderWithProviders(<div />);

    expect(await screen.findByText('Welcome to Household')).toBeInTheDocument();
  });

  it.each(['completed', 'skipped', 'reviewed_later'])(
    'does not auto-open when onboardingStatus is %s',
    async (status) => {
      mockMe(status);
      renderWithProviders(<div />);
      await vi.advanceTimersByTimeAsync(50);
      expect(
        screen.queryByText('Welcome to Household'),
      ).not.toBeInTheDocument();
    },
  );

  it('skipping on the intro step PATCHes skipped and closes immediately', async () => {
    mockMe('pending');
    const patches = capturePatches();
    renderWithProviders(<div />);

    await screen.findByText('Welcome to Household');
    fireEvent.click(screen.getByText('Skip'));

    await waitFor(() =>
      expect(patches).toEqual([{ onboardingStatus: 'skipped' }]),
    );
    expect(screen.queryByText('Welcome to Household')).not.toBeInTheDocument();
  });

  it('walking every step to the end PATCHes completed, clicking through real nav links for page transitions', async () => {
    mockMe('pending');
    const patches = capturePatches();
    renderWithProviders(
      <>
        <LocationProbe />
        <NavStub />
      </>,
    );

    await screen.findByText('Welcome to Household');

    for (const step of TOUR_STEPS) {
      await advancePastStep(step);
    }

    expect(patches).toEqual([{ onboardingStatus: 'completed' }]);
    expect(screen.getByTestId('location').textContent).toBe('/dashboard');
  });

  it('an interactive step spotlights a real, clickable nav link and advances on navigation, without a Next button', async () => {
    mockMe('pending');
    renderWithProviders(<NavStub />);

    await screen.findByText('Welcome to Household');
    await advancePastStep(TOUR_STEPS[0]); // intro -> dashboard-stats
    await advancePastStep(TOUR_STEPS[1]); // dashboard-stats -> nav-to-accounts

    expect(await screen.findByText('Head to Accounts')).toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Accounts'));
    await vi.advanceTimersByTimeAsync(1100);

    expect(await screen.findByText('Add an account')).toBeInTheDocument();
  });

  it('back() returns to the previous step without writing anything', async () => {
    mockMe('pending');
    const patches = capturePatches();
    renderWithProviders(<div />);

    await screen.findByText('Welcome to Household');
    await advancePastStep(TOUR_STEPS[0]);
    expect(await screen.findByText('Your overview')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back'));
    expect(await screen.findByText('Welcome to Household')).toBeInTheDocument();
    expect(patches).toEqual([]);
  });

  it('manual (i) re-open that reaches the end PATCHes reviewed_later', async () => {
    mockMe('completed');
    const patches = capturePatches();
    renderWithProviders(
      <>
        <ReopenHarness />
        <NavStub />
      </>,
    );

    fireEvent.click(await screen.findByText('reopen'));
    await screen.findByText('Welcome to Household');

    for (const step of TOUR_STEPS) {
      await advancePastStep(step);
    }

    expect(patches).toEqual([{ onboardingStatus: 'reviewed_later' }]);
  });

  it('manual (i) re-open that is skipped sends no PATCH', async () => {
    mockMe('completed');
    const patches = capturePatches();
    renderWithProviders(<ReopenHarness />);

    fireEvent.click(await screen.findByText('reopen'));
    await screen.findByText('Welcome to Household');
    fireEvent.click(screen.getByText('Skip'));

    await vi.advanceTimersByTimeAsync(50);
    expect(patches).toEqual([]);
  });
});
