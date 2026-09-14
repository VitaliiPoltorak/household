import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useAuth } from '../../contexts/AuthContext';
import { useHousehold } from '../../contexts/HouseholdContext';
import { useEnabledAccountTypes } from '../../hooks/useEnabledAccountTypes';
import { useAsyncSubmit } from '../../hooks/useAsyncSubmit';
import { householdsApi } from '../../api/households';
import { financeApi } from '../../api/finance';
import { shoppingApi } from '../../api/shopping';
import { accountTypeLabel } from '../../lib/account-type-label';
import type { Household } from '../../types/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { FormError } from '../ui/FormError';

type Step = 'household' | 'account' | 'shopping' | 'done';
const STEPS: Step[] = ['household', 'account', 'shopping', 'done'];

/**
 * First-run setup guide (#347): household → first account → first shopping
 * list → done. Every step is individually skippable (advances without
 * writing anything); the modal's × / Escape is the global bail-out and is
 * what actually decides completed vs. skipped — see OnboardingContext.
 */
export function OnboardingWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isOpen, finish } = useOnboarding();
  const { user } = useAuth();
  const { households, activeHousehold, setActiveHousehold } = useHousehold();
  const [step, setStep] = useState<Step>('household');
  // The household just created in this run, if any — used instead of
  // waiting on activeHousehold/households to refetch so step 2 can proceed
  // immediately after step 1 without a round trip.
  const [hid, setHid] = useState<string | null>(null);

  // Reset to the right starting step each time the wizard opens: skip
  // straight past "create a household" for a user who already has one.
  useEffect(() => {
    if (!isOpen) return;
    setHid(activeHousehold?.id ?? null);
    setStep(households.length > 0 ? 'account' : 'household');
    // Only re-derive when the wizard transitions open — not on every
    // households/activeHousehold change, which would yank the user back a
    // step mid-flow the moment their own "create household" call resolves
    // and HouseholdContext's query refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  };

  // Steps 2-3 are scoped to a household; if the user skipped step 1 there's
  // nothing for them to attach to, so fast-forward straight to "done"
  // instead of rendering an empty form. Done as an effect, not inline during
  // render, so it doesn't fight React over updating state mid-render.
  useEffect(() => {
    if (!isOpen || hid) return;
    if (step === 'account' || step === 'shopping') setStep('done');
  }, [isOpen, hid, step]);

  if (!isOpen) return null;

  const bail = () => finish(false);
  const complete = () => {
    finish(true);
    navigate('/dashboard');
  };

  return (
    <Modal title={t('onboarding.title')} onClose={bail}>
      <p className="-mt-2 mb-4 text-xs text-gray-400 dark:text-gray-500">
        {t('onboarding.progress', {
          current: STEPS.indexOf(step) + 1,
          total: STEPS.length,
        })}
      </p>

      {step === 'household' && (
        <HouseholdStep
          existingName={activeHousehold?.name ?? null}
          onCreated={(h) => {
            setHid(h.id);
            setActiveHousehold(h);
            goNext();
          }}
          onNext={() => {
            // hid may still be null here: the open-effect that seeds it ran
            // before HouseholdContext's households query resolved (it only
            // reruns on isOpen, not on every households/activeHousehold
            // change — see that effect's comment). activeHousehold is what
            // this branch is actually rendered from, so it's the reliable
            // source at click time.
            if (activeHousehold) setHid(activeHousehold.id);
            goNext();
          }}
          onSkip={bail}
        />
      )}

      {/* hid can briefly be null here right after skipping step 1 — the
          fast-forward effect above moves off this step before the next
          paint, so this frame renders nothing rather than an empty form. */}
      {step === 'account' && hid && (
        <AccountStep hid={hid} onCreated={goNext} onSkip={goNext} />
      )}

      {step === 'shopping' && hid && (
        <ShoppingStep
          hid={hid}
          uid={user!.id}
          onCreated={goNext}
          onSkip={goNext}
        />
      )}

      {step === 'done' && <DoneStep onFinish={complete} />}
    </Modal>
  );
}

function HouseholdStep({
  existingName,
  onCreated,
  onNext,
  onSkip,
}: {
  existingName: string | null;
  onCreated: (h: Household) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const { submitting, error, setError, run } = useAsyncSubmit();

  if (existingName) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('onboarding.steps.household.already', { name: existingName })}
        </p>
        <div className="flex justify-end">
          <Button onClick={onNext}>{t('onboarding.next')}</Button>
        </div>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void run(async () => {
      const h = await householdsApi.create(name.trim());
      onCreated(h);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t('onboarding.steps.household.description')}
      </p>
      <Input
        label={t('household.namePlaceholder')}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        autoFocus
      />
      <FormError message={error} />
      <StepActions
        skipLabel={t('onboarding.skipAll')}
        onSkip={onSkip}
        submitting={submitting}
        submitDisabled={!name.trim()}
      />
    </form>
  );
}

function AccountStep({
  hid,
  onCreated,
  onSkip,
}: {
  hid: string;
  onCreated: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const { data: enabledTypes = [] } = useEnabledAccountTypes(hid);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const { submitting, error, setError, run } = useAsyncSubmit();

  useEffect(() => {
    if (!type && enabledTypes.length > 0) setType(enabledTypes[0].typeCode);
  }, [enabledTypes, type]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !type) return;
    void run(async () => {
      await financeApi.createAccount(hid, { name: name.trim(), type });
      onCreated();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t('onboarding.steps.account.description')}
      </p>
      <Input
        label={t('accounts.name')}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        placeholder={t('accounts.namePlaceholder')}
        autoFocus
      />
      <Select
        label={t('accounts.type')}
        value={type}
        onChange={(e) => setType(e.target.value)}
        disabled={enabledTypes.length === 0}
      >
        {enabledTypes.map((et) => (
          <option key={et.typeCode} value={et.typeCode}>
            {accountTypeLabel(et.typeCode, enabledTypes, t)}
          </option>
        ))}
      </Select>
      <FormError message={error} />
      <StepActions
        skipLabel={t('onboarding.skipStep')}
        onSkip={onSkip}
        submitting={submitting}
        submitDisabled={!name.trim() || !type}
      />
    </form>
  );
}

function ShoppingStep({
  hid,
  uid,
  onCreated,
  onSkip,
}: {
  hid: string;
  uid: string;
  onCreated: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const { submitting, error, setError, run } = useAsyncSubmit();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void run(async () => {
      await shoppingApi.createList(hid, uid, { name: name.trim() });
      onCreated();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t('onboarding.steps.shopping.description')}
      </p>
      <Input
        label={t('shopping.listName')}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        autoFocus
      />
      <FormError message={error} />
      <StepActions
        skipLabel={t('onboarding.skipStep')}
        onSkip={onSkip}
        submitting={submitting}
        submitDisabled={!name.trim()}
      />
    </form>
  );
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t('onboarding.steps.done.description')}
      </p>
      <div className="flex justify-end">
        <Button onClick={onFinish}>{t('onboarding.steps.done.cta')}</Button>
      </div>
    </div>
  );
}

function StepActions({
  skipLabel,
  onSkip,
  submitting,
  submitDisabled,
}: {
  skipLabel: string;
  onSkip: () => void;
  submitting: boolean;
  submitDisabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between pt-2">
      <button
        type="button"
        onClick={onSkip}
        className="text-sm text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      >
        {skipLabel}
      </button>
      <Button type="submit" disabled={submitting || submitDisabled}>
        {submitting ? t('common.saving') : t('common.create')}
      </Button>
    </div>
  );
}
