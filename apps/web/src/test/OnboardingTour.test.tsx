import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
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

/** Clicks Next/Finish, letting the target-search retry loop (up to ~1s per
 * targeted step) flush via fake timers rather than waiting on it for real. */
async function clickNext() {
  const button = screen.queryByText('Finish') ?? screen.getByText('Next');
  fireEvent.click(button);
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

  it('walking every step to the end PATCHes completed and navigates through the real pages', async () => {
    mockMe('pending');
    const patches = capturePatches();
    renderWithProviders(<LocationProbe />);

    await screen.findByText('Welcome to Household');

    // One click per step to land on it, plus one more to actually press
    // "Finish" on the last step (TOUR_STEPS.length clicks, not length - 1).
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      await clickNext();
    }

    expect(patches).toEqual([{ onboardingStatus: 'completed' }]);
    // The last targeted step lives on /household — outro navigates back
    // to /dashboard, matching tourSteps.ts.
    expect(screen.getByTestId('location').textContent).toBe('/dashboard');
  });

  it('back() returns to the previous step without writing anything', async () => {
    mockMe('pending');
    const patches = capturePatches();
    renderWithProviders(<div />);

    await screen.findByText('Welcome to Household');
    await clickNext();
    expect(await screen.findByText('Your overview')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back'));
    expect(await screen.findByText('Welcome to Household')).toBeInTheDocument();
    expect(patches).toEqual([]);
  });

  it('manual (i) re-open that reaches the end PATCHes reviewed_later', async () => {
    mockMe('completed');
    const patches = capturePatches();
    renderWithProviders(<ReopenHarness />);

    fireEvent.click(await screen.findByText('reopen'));
    await screen.findByText('Welcome to Household');

    for (let i = 0; i < TOUR_STEPS.length; i++) {
      await clickNext();
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
