import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../api/finance';
import { householdsApi } from '../../api/households';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';

/** 'YYYY-MM' -> localized month name ("November", "листопад", ...). */
export function formatPromptMonth(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, 1)));
  } catch {
    return month;
  }
}

/**
 * Month-end confirmation bar (#406): "Have all incomes for {month} been
 * entered?" with Yes / Postpone. Shown only to roles that can write (not
 * viewers). The state is per household, so other members' bars disappear via
 * the `snapshotPrompt` realtime entity event (see SocketContext).
 */
export function SnapshotPromptBar({ hid }: { hid: string }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: members } = useQuery({
    queryKey: ['members', hid],
    queryFn: () => householdsApi.getMembers(hid, hid),
  });
  const role = members?.find((m) => m.userId === user?.id)?.role;
  const canWrite = !!role && role !== 'viewer';

  const key = ['net-worth-snapshot-prompt', hid];
  const { data: prompt } = useQuery({
    queryKey: key,
    queryFn: () => financeApi.getSnapshotPrompt(hid),
    enabled: canWrite,
  });

  const onDone = (state: unknown) => qc.setQueryData(key, state);
  const confirm = useMutation({
    mutationFn: () => financeApi.confirmSnapshotPrompt(hid),
    onSuccess: onDone,
  });
  const snooze = useMutation({
    mutationFn: () => financeApi.snoozeSnapshotPrompt(hid),
    onSuccess: onDone,
  });

  if (!canWrite || !prompt?.show || !prompt.month) return null;
  const busy = confirm.isPending || snooze.isPending;

  return (
    <div
      role="region"
      aria-label={t('netWorthHistory.prompt.label')}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-900/20"
    >
      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
        {t('netWorthHistory.prompt.question', {
          month: formatPromptMonth(prompt.month, i18n.language),
        })}
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => confirm.mutate()}>
          {t('netWorthHistory.prompt.yes')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => snooze.mutate()}
        >
          {t('netWorthHistory.prompt.postpone')}
        </Button>
      </div>
    </div>
  );
}
