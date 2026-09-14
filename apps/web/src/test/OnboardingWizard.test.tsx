import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './wrapper';
import { server } from './setup';
import { MOCK_USER } from './handlers';
import { useOnboarding } from '../contexts/OnboardingContext';

const BASE = '/api/v1';

/** Exercises the (i) re-entry path without depending on Header's markup. */
function ReopenHarness() {
  const { openManually } = useOnboarding();
  return <button onClick={openManually}>reopen</button>;
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

describe('OnboardingWizard (#347)', () => {
  it('auto-opens when onboardingStatus is pending', async () => {
    mockMe('pending');
    renderWithProviders(<div />);

    expect(await screen.findByText('Get started')).toBeInTheDocument();
  });

  it.each(['completed', 'skipped', 'reviewed_later'])(
    'does not auto-open when onboardingStatus is %s',
    async (status) => {
      mockMe(status);
      renderWithProviders(<div />);

      // Nothing to await for absence — wait for the auth bootstrap's GET
      // /auth/me to resolve (confirmed via a spy-free proxy: the promise
      // microtask queue draining), then assert the wizard never appeared.
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByText('Get started')).not.toBeInTheDocument();
    },
  );

  it('bailing out (×) on the auto-opened wizard PATCHes skipped', async () => {
    mockMe('pending');
    const patches = capturePatches();
    renderWithProviders(<div />);

    await screen.findByText('Get started');
    fireEvent.click(screen.getByText('×'));

    await waitFor(() =>
      expect(patches).toEqual([{ onboardingStatus: 'skipped' }]),
    );
  });

  it('walking every step to the end PATCHes completed', async () => {
    mockMe('pending');
    server.use(http.get(`${BASE}/households`, () => HttpResponse.json([])));
    const patches = capturePatches();

    renderWithProviders(<div />);

    await screen.findByText('Get started');

    // Step 1 — create household.
    fireEvent.change(screen.getByLabelText('Home name…'), {
      target: { value: 'My New Home' },
    });
    fireEvent.click(screen.getByText('Create'));

    // Step 2 — add first account.
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Main checking' },
    });
    fireEvent.click(screen.getByText('Create'));

    // Step 3 — first shopping list.
    await screen.findByLabelText('List name');
    fireEvent.change(screen.getByLabelText('List name'), {
      target: { value: 'Groceries' },
    });
    fireEvent.click(screen.getByText('Create'));

    // Step 4 — done.
    fireEvent.click(await screen.findByText('Go to dashboard'));

    await waitFor(() =>
      expect(patches).toEqual([{ onboardingStatus: 'completed' }]),
    );
  });

  it('manual (i) re-open that reaches the end PATCHes reviewed_later', async () => {
    mockMe('skipped');
    const patches = capturePatches();
    renderWithProviders(<ReopenHarness />);

    fireEvent.click(await screen.findByText('reopen'));
    // MOCK_HOUSEHOLD already exists, so this is the "already set up" screen.
    fireEvent.click(await screen.findByText('Next'));
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByText('Skip this step'));
    await screen.findByLabelText('List name');
    fireEvent.click(screen.getByText('Skip this step'));
    fireEvent.click(await screen.findByText('Go to dashboard'));

    await waitFor(() =>
      expect(patches).toEqual([{ onboardingStatus: 'reviewed_later' }]),
    );
  });

  it('manual (i) re-open that is dismissed sends no PATCH', async () => {
    mockMe('completed');
    const patches = capturePatches();
    renderWithProviders(<ReopenHarness />);

    fireEvent.click(await screen.findByText('reopen'));
    fireEvent.click(await screen.findByText('×'));

    // Give any accidental async PATCH a chance to land before asserting none did.
    await new Promise((r) => setTimeout(r, 0));
    expect(patches).toEqual([]);
  });
});
