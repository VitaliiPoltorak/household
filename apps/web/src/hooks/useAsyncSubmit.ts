import { useCallback, useState } from 'react';
import { ApiError } from '../api/client';

/**
 * Wraps a modal's async submit handler so a failure is caught, kept, and
 * rendered (#330).
 *
 * Several submit handlers were written as `try { … } finally { setSaving(false) }`
 * with no `catch`. The rejection escaped as an unhandled promise rejection and
 * the spinner reset, which makes a dialog look idle and ready — indistinguishable
 * from "you haven't pressed the button yet". The user's natural response is to
 * press the button again, which on a partial failure (request sent, response
 * lost) risks creating a duplicate.
 *
 * This exists as a hook rather than three copies of the same catch so a future
 * modal cannot reintroduce the shape by omission; the one-place-fix-not-
 * generalised pattern is what past audits kept finding.
 *
 * Handlers that need more than a message — a field-level error, a typed code —
 * should keep their own catch; see the withdrawal guard in CreateTxModal.
 */
export function useAsyncSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setSubmitting(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(describeError(err));
    } finally {
      // The component is often unmounted by a successful handler (it closes
      // its own dialog). React 18 no longer warns about setting state after
      // unmount, and the alternative — an is-mounted ref — would be more
      // machinery than the problem deserves.
      setSubmitting(false);
    }
  }, []);

  return { submitting, error, setError, run };
}

function describeError(err: unknown): string {
  // ApiError carries the server's own message, which is written for a user;
  // prefer it over the generic Error string.
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
