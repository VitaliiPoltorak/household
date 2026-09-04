import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, clearAuthTokens } from './wrapper';
import { RegisterPage } from '../pages/RegisterPage';
import { server } from './setup';

const BASE = '/api/v1';
const STRONG = 'Journey-Windmill-Copper-12';

describe('RegisterPage', () => {
  beforeEach(() => clearAuthTokens());

  it('renders create-account form with three fields', () => {
    renderWithProviders(<RegisterPage />, { preloadTokens: false });
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('rejects a short password client-side before hitting the server', async () => {
    const user = userEvent.setup();
    let requestFired = false;
    server.use(
      http.post(`${BASE}/auth/register`, () => {
        requestFired = true;
        return HttpResponse.json({ userId: 'x', email: 'x@x.com' }, { status: 202 });
      }),
    );

    renderWithProviders(<RegisterPage />, { preloadTokens: false });
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Your name'), 'Alice');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Password must be at least 12 characters.')).toBeInTheDocument();
    expect(requestFired).toBe(false);
  });

  it('shows the "email already registered" message on 409', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/register`, () =>
        HttpResponse.json({ statusCode: 409, message: 'Email is already registered' }, { status: 409 }),
      ),
    );

    renderWithProviders(<RegisterPage />, { preloadTokens: false });
    await user.type(screen.getByLabelText('Email'), 'taken@example.com');
    await user.type(screen.getByLabelText('Your name'), 'Alice');
    await user.type(screen.getByLabelText('Password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('This email is already registered. Try signing in instead.'),
    ).toBeInTheDocument();
  });

  // #320 — a 409 is often the user's own unverified signup. /register can
  // never move them forward, so the error offers the verify screen as a way
  // out rather than leaving them stranded.
  it('offers a route to /verify-email after a 409', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/register`, () =>
        HttpResponse.json({ statusCode: 409, message: 'Email is already registered' }, { status: 409 }),
      ),
    );

    renderWithProviders(<RegisterPage />, { preloadTokens: false });
    await user.type(screen.getByLabelText('Email'), 'taken@example.com');
    await user.type(screen.getByLabelText('Your name'), 'Alice');
    await user.type(screen.getByLabelText('Password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const link = await screen.findByRole('link', {
      name: 'Finish verifying this address',
    });
    expect(link).toHaveAttribute('href', '/verify-email');
  });

  it('offers no such route when registration fails for another reason', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/register`, () =>
        HttpResponse.json({ code: 'PASSWORD_PWNED' }, { status: 400 }),
      ),
    );

    renderWithProviders(<RegisterPage />, { preloadTokens: false });
    await user.type(screen.getByLabelText('Email'), 'fresh@example.com');
    await user.type(screen.getByLabelText('Your name'), 'Alice');
    await user.type(screen.getByLabelText('Password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await screen.findByRole('alert');
    expect(
      screen.queryByRole('link', { name: 'Finish verifying this address' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces WEAK_PASSWORD suggestions from the server', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/register`, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            code: 'WEAK_PASSWORD',
            message: 'weak',
            score: 1,
            suggestions: ['Add more words.', 'Avoid repeats.'],
          },
          { status: 400 },
        ),
      ),
    );

    renderWithProviders(<RegisterPage />, { preloadTokens: false });
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Your name'), 'Alice');
    await user.type(screen.getByLabelText('Password'), 'passwordpassword12');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    // Localised WEAK_PASSWORD message + the server's own suggestion list.
    expect(
      await screen.findByText(
        'This password is too easy to guess. Try a longer or less common phrase.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Add more words.')).toBeInTheDocument();
    expect(screen.getByText('Avoid repeats.')).toBeInTheDocument();
  });

  it('surfaces PASSWORD_PWNED verbatim on breach-corpus hit', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/register`, () =>
        HttpResponse.json(
          { statusCode: 400, code: 'PASSWORD_PWNED', message: 'pwned' },
          { status: 400 },
        ),
      ),
    );

    renderWithProviders(<RegisterPage />, { preloadTokens: false });
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Your name'), 'Alice');
    await user.type(screen.getByLabelText('Password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText(
        'This password has appeared in a public breach and is not safe to use. Please choose another.',
      ),
    ).toBeInTheDocument();
  });

  it('completes the /auth/register call on happy path (no error surfaced)', async () => {
    const user = userEvent.setup();
    let submitted = false;
    server.use(
      http.post(`${BASE}/auth/register`, async ({ request }) => {
        const body = (await request.json()) as { email: string };
        submitted = true;
        return HttpResponse.json({ userId: 'user-new', email: body.email }, { status: 202 });
      }),
    );

    renderWithProviders(<RegisterPage />, { preloadTokens: false });
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Your name'), 'Alice');
    await user.type(screen.getByLabelText('Password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    // MemoryRouter here only knows about /register — navigate('/verify-email')
    // changes the URL but doesn't unmount the page. Instead we assert on the
    // observable outcome: the POST ran and no error banner is shown.
    await waitFor(() => expect(submitted).toBe(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
