import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { td } from '../../lib/i18n-dynamic';
import { Button } from '../ui/Button';

// Breathing room between the spotlighted element and both the dim cutout
// and the tooltip card, so the highlight ring doesn't hug the element.
const PAD = 8;
// The new page's target may not be mounted on the tick navigate() fires —
// poll briefly rather than assume it's there immediately.
const FIND_TARGET_RETRY_MS = 50;
const FIND_TARGET_MAX_ATTEMPTS = 20;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_ESTIMATED_HEIGHT = 180;

/**
 * The guided-tour spotlight (#347): dims the whole viewport, cuts a hole
 * around the current step's real target element, and shows a tooltip with
 * Back/Skip/Next.
 *
 * Two modes:
 * - Explain steps: the background (including the spotlighted element
 *   itself) is not clickable — the tour is only describing something, not
 *   simulating it, so advancing happens exclusively through the tooltip's
 *   own buttons.
 * - Interactive steps (`currentStep.interactive`): the spotlighted element
 *   is a real nav link and stays genuinely clickable through the dim
 *   overlay — the tour advances itself once that real click lands (see
 *   OnboardingContext), so the tooltip drops its Next button for a hint
 *   instead. This is what makes a page transition a real user action
 *   rather than the tour silently teleporting them there.
 */
export function TourOverlay() {
  const { isActive, currentStep, stepIndex, totalSteps, next, back, skip } =
    useOnboarding();
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!isActive || !currentStep?.target) {
      setRect(null);
      return;
    }

    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const measure = () => {
      // A nav target exists twice in the DOM (desktop Sidebar + mobile
      // MobileTabBar) — only one is visible at a given viewport width via
      // CSS, so pick whichever actually has a size rather than always the
      // first match.
      const candidates = document.querySelectorAll(
        `[data-tour="${currentStep.target}"]`,
      );
      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setRect(r);
          return true;
        }
      }
      return false;
    };

    const tryFind = () => {
      if (measure()) return;
      attempts += 1;
      if (attempts < FIND_TARGET_MAX_ATTEMPTS) {
        timer = setTimeout(tryFind, FIND_TARGET_RETRY_MS);
      }
    };
    tryFind();

    const onViewportChange = () => measure();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [isActive, currentStep]);

  if (!isActive || !currentStep) return null;

  const interactive = !!currentStep.interactive;
  const cardProps: TourCardProps = {
    titleKey: currentStep.titleKey,
    bodyKey: currentStep.bodyKey,
    stepIndex,
    totalSteps,
    isLast: stepIndex === totalSteps - 1,
    interactive,
    onBack: back,
    onSkip: skip,
    onNext: next,
  };
  const dimClass = 'fixed bg-black/50 dark:bg-black/70';
  // Interactive steps need clicks to pass through the hole to the real nav
  // link underneath — the outer layer stops blocking everything, and each
  // dim quadrant + the tooltip opt back in individually.
  const dimStyle = interactive ? ({ pointerEvents: 'auto' } as const) : {};
  const tooltipStyle = interactive ? ({ pointerEvents: 'auto' } as const) : {};

  return createPortal(
    <div
      className="fixed inset-0 z-[60]"
      style={{ pointerEvents: interactive ? 'none' : 'auto' }}
    >
      {rect ? (
        <>
          <div
            className={dimClass}
            style={{
              ...dimStyle,
              top: 0,
              left: 0,
              width: '100vw',
              height: Math.max(0, rect.top - PAD),
            }}
          />
          <div
            className={dimClass}
            style={{
              ...dimStyle,
              top: rect.bottom + PAD,
              left: 0,
              width: '100vw',
              bottom: 0,
            }}
          />
          <div
            className={dimClass}
            style={{
              ...dimStyle,
              top: Math.max(0, rect.top - PAD),
              left: 0,
              width: Math.max(0, rect.left - PAD),
              height: rect.height + PAD * 2,
            }}
          />
          <div
            className={dimClass}
            style={{
              ...dimStyle,
              top: Math.max(0, rect.top - PAD),
              left: rect.right + PAD,
              right: 0,
              height: rect.height + PAD * 2,
            }}
          />
          <div
            className="fixed rounded-lg ring-2 ring-primary-400"
            style={{
              pointerEvents: 'none',
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }}
          />
          <div
            className="fixed"
            style={{ ...tooltipStyle, ...tooltipPosition(rect) }}
          >
            <TourCard {...cardProps} />
          </div>
        </>
      ) : (
        <>
          <div className={dimClass} style={{ ...dimStyle, inset: 0 }} />
          <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={tooltipStyle}
          >
            <TourCard {...cardProps} />
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

// Prefer below the target; flip above if there isn't enough room. No
// general placement algorithm needed — this is the tour's only consumer.
function tooltipPosition(anchorRect: DOMRect): { top: number; left: number } {
  const below =
    anchorRect.bottom + PAD + TOOLTIP_ESTIMATED_HEIGHT <= window.innerHeight;
  const top = below
    ? anchorRect.bottom + PAD * 2
    : Math.max(PAD, anchorRect.top - PAD * 2 - TOOLTIP_ESTIMATED_HEIGHT);
  const left = Math.min(
    Math.max(PAD, anchorRect.left),
    window.innerWidth - TOOLTIP_WIDTH - PAD,
  );
  return { top, left };
}

interface TourCardProps {
  titleKey: string;
  bodyKey: string;
  stepIndex: number;
  totalSteps: number;
  isLast: boolean;
  interactive: boolean;
  onBack: () => void;
  onSkip: () => void;
  onNext: () => void;
}

function TourCard({
  titleKey,
  bodyKey,
  stepIndex,
  totalSteps,
  isLast,
  interactive,
  onBack,
  onSkip,
  onNext,
}: TourCardProps) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-xl bg-white p-4 shadow-xl dark:bg-gray-900"
      style={{ width: TOOLTIP_WIDTH }}
    >
      <p className="mb-1 text-xs text-gray-400 dark:text-gray-500">
        {t('tour.progress', { current: stepIndex + 1, total: totalSteps })}
      </p>
      <h2 className="mb-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
        {td(t, titleKey)}
      </h2>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
        {td(t, bodyKey)}
      </p>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          {t('tour.skip')}
        </button>
        {interactive ? (
          <p className="animate-pulse text-xs font-medium text-primary-600 dark:text-primary-400">
            {t('tour.clickHint')}
          </p>
        ) : (
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button variant="secondary" size="sm" onClick={onBack}>
                {t('tour.back')}
              </Button>
            )}
            <Button size="sm" onClick={onNext}>
              {isLast ? t('tour.finish') : t('tour.next')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
