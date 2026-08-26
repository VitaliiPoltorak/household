import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { householdsApi } from '../api/households';
import { useAcceptInvite } from '../hooks/useAcceptInvite';
import { Button } from '../components/ui/Button';
import { formatDate } from '../lib/date-format';

/**
 * Active invites addressed to the current user's email — the counterpart to
 * HouseholdPage's owner-side invite list. Reached from the sidebar (#267),
 * not just via the one-off /invite?token= link, so an invite is never lost
 * if the copied link never made it to the invitee.
 */
export function InvitesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const acceptInvite = useAcceptInvite();

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ['my-invites'],
    queryFn: () => householdsApi.listMyInvites(),
  });

  const accept = useMutation({
    mutationFn: (token: string) => acceptInvite(token),
    onSuccess: () => navigate('/household'),
  });

  const decline = useMutation({
    mutationFn: (token: string) => householdsApi.declineInvite(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-invites'] }),
  });

  const busy = accept.isPending || decline.isPending;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('invites.title')}
      </h1>

      {isLoading ? (
        <Spinner />
      ) : invites.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {t('invites.empty')}
        </p>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {invite.household.name}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t(`household.roles.${invite.role}`)} ·{' '}
                  {t('household.expiresOn', {
                    date: formatDate(invite.expiresAt),
                  })}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => decline.mutate(invite.token)}
                  disabled={busy}
                >
                  {t('invites.decline')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => accept.mutate(invite.token)}
                  disabled={busy}
                >
                  {t('invites.accept')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
  );
}
