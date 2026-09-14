import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../api/auth';
import { useAuth } from './AuthContext';
import { TOUR_STEPS, type TourStep } from '../components/onboarding/tourSteps';
import { TourOverlay } from '../components/onboarding/TourOverlay';

// Which invocation is currently open, if any. Decides what `finish` writes:
// an 'auto' run (status was 'pending') records the user's first real choice
// (completed/skipped); a 'manual' run (opened via the (i) button) only ever
// upgrades to 'reviewed_later', and a manual bail-out writes nothing — #347
// only wants the flag to move forward, never regress a completed/skipped
// user back to a lesser status just because they peeked at the tour again.
type OpenReason = 'auto' | 'manual' | null;

interface OnboardingContextValue {
  isActive: boolean;
  currentStep: TourStep | null;
  stepIndex: number;
  totalSteps: number;
  next: () => void;
  back: () => void;
  skip: () => void;
  openManually: () => void;
  // True when the tour is currently spotlighting the element registered
  // under this target id — pages use this to swap a real empty-state for a
  // canned "Example" row instead, without ever touching the backend.
  isStepTarget: (target: string) => boolean;
  // True when the tour's current step lives on this route. A brand-new
  // user has no real household yet, and every page gates its content on
  // one — pages use this to render their tour content anyway instead of
  // the normal "you have no household" message, so the tour still has
  // something real to spotlight for the exact user #347 is for.
  isTourPage: (page: string) => boolean;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openReason, setOpenReason] = useState<OpenReason>(null);
  const [stepIndex, setStepIndex] = useState(0);

  // Auto-start exactly once per 'pending' user per session — without this
  // guard, a `finish(false)` that leaves status untouched (network hiccup)
  // combined with a `refreshUser()` re-render would restart the tour the
  // instant it closed.
  const autoOfferedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.onboardingStatus !== 'pending') return;
    if (autoOfferedFor.current === user.id) return;
    autoOfferedFor.current = user.id;
    setStepIndex(0);
    setOpenReason('auto');
  }, [user]);

  const isActive = openReason !== null;
  const currentStep = isActive ? TOUR_STEPS[stepIndex] : null;

  // Every step change navigates to that step's page (a no-op when already
  // there) so the spotlight always has a real, mounted target to find.
  useEffect(() => {
    if (!currentStep) return;
    if (location.pathname !== currentStep.page) navigate(currentStep.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.id]);

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
      setStepIndex(0);
    },
    [refreshUser],
  );

  const next = useCallback(() => {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      finish(true);
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [stepIndex, finish]);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const skip = useCallback(() => finish(false), [finish]);

  const openManually = useCallback(() => {
    setStepIndex(0);
    setOpenReason('manual');
  }, []);

  const isStepTarget = useCallback(
    (target: string) => isActive && currentStep?.target === target,
    [isActive, currentStep],
  );

  const isTourPage = useCallback(
    (page: string) => isActive && currentStep?.page === page,
    [isActive, currentStep],
  );

  return (
    <OnboardingContext.Provider
      value={{
        isActive,
        currentStep,
        stepIndex,
        totalSteps: TOUR_STEPS.length,
        next,
        back,
        skip,
        openManually,
        isStepTarget,
        isTourPage,
      }}
    >
      {children}
      <TourOverlay />
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx)
    throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
