import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { authApi } from '../api/auth';
import { useAuth } from './AuthContext';
import { OnboardingWizard } from '../components/onboarding/OnboardingWizard';

// Which invocation is currently open, if any. Decides what `finish` writes:
// an 'auto' run (status was 'pending') records the user's first real choice
// (completed/skipped); a 'manual' run (opened via the (i) button) only ever
// upgrades to 'reviewed_later', and a manual bail-out writes nothing — #347
// only wants the flag to move forward, never regress a completed/skipped
// user back to a lesser status just because they peeked at the guide again.
type OpenReason = 'auto' | 'manual' | null;

interface OnboardingContextValue {
  isOpen: boolean;
  openManually: () => void;
  finish: (reachedEnd: boolean) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [openReason, setOpenReason] = useState<OpenReason>(null);

  // Auto-open exactly once per 'pending' user per session — without this
  // guard, a `finish(false)` that leaves status untouched (network hiccup)
  // combined with a `refreshUser()` re-render would reopen the wizard the
  // instant it closed.
  const autoOfferedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.onboardingStatus !== 'pending') return;
    if (autoOfferedFor.current === user.id) return;
    autoOfferedFor.current = user.id;
    setOpenReason('auto');
  }, [user]);

  const openManually = useCallback(() => {
    setOpenReason('manual');
  }, []);

  const finish = useCallback(
    (reachedEnd: boolean) => {
      setOpenReason((reason) => {
        const status =
          reason === 'auto'
            ? reachedEnd
              ? 'completed'
              : 'skipped'
            : reason === 'manual' && reachedEnd
              ? 'reviewed_later'
              : null;

        if (status) {
          void authApi
            .updateProfile({ onboardingStatus: status })
            .then(() => refreshUser())
            .catch(() => null);
        }
        return null;
      });
    },
    [refreshUser],
  );

  return (
    <OnboardingContext.Provider
      value={{ isOpen: openReason !== null, openManually, finish }}
    >
      {children}
      <OnboardingWizard />
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx)
    throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
