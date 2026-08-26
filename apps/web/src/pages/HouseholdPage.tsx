import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { householdsApi } from '../api/households';
import { authApi } from '../api/auth';
import type { MemberRole, PublicUserProfile } from '../types/api';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { RoleBadge } from '../components/households/RoleBadge';
import { formatDate } from '../lib/date-format';

const ROLES: MemberRole[] = ['admin', 'member', 'viewer'];

export function HouseholdPage() {
  const { t } = useTranslation();
  const { activeHousehold, households, setActiveHousehold, refetch } =
    useHousehold();
  const qc = useQueryClient();
  const hid = activeHousehold?.id ?? '';

  const [showInvite, setShowInvite] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ['members', hid],
    queryFn: () => householdsApi.getMembers(hid, hid),
    enabled: !!hid,
  });

  // Second-level query: resolve every member's userId to a display name +
  // avatar via the auth service. Sorted CSV cache key so overlapping calls
  // dedupe correctly (e.g. two households sharing the same member).
  const sortedUserIds = useMemo(
    () => members.map((m) => m.userId).sort(),
    [members],
  );
  const { data: userProfiles = [] } = useQuery({
    queryKey: ['users', sortedUserIds.join(',')],
    queryFn: () => authApi.getUsers(sortedUserIds),
    enabled: sortedUserIds.length > 0,
    staleTime: 5 * 60 * 1000, // display names rarely change; keep 5 min
  });
  const userById = useMemo(() => {
    const m = new Map<string, PublicUserProfile>();
    for (const u of userProfiles) m.set(u.id, u);
    return m;
  }, [userProfiles]);

  const { data: invites = [] } = useQuery({
    queryKey: ['invites', hid],
    queryFn: () => householdsApi.getInvites(hid, hid),
    enabled: !!hid,
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      householdsApi.removeMember(hid, memberId, hid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', hid] }),
  });

  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) =>
      householdsApi.deleteInvite(hid, inviteId, hid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites', hid] }),
  });

  const deleteHousehold = useMutation({
    mutationFn: () => householdsApi.remove(hid, hid),
    onSuccess: () => {
      refetch();
      const remaining = households.filter((h) => h.id !== hid);
      if (remaining[0]) setActiveHousehold(remaining[0]);
    },
  });

  if (!activeHousehold)
    return (
      <p className="text-gray-500 dark:text-gray-400">
        Select a household first.
      </p>
    );

  // Copying is only offered at creation time in InviteModal today — if that
  // one-shot copy is missed, the previous flow left no way back short of
  // revoking and re-inviting. The token from GET .../invites is the same
  // one InviteModal builds its link from, so this just re-exposes it (#267).
  const copyInviteLink = async (inviteId: string, token: string) => {
    const link = `${window.location.origin}/invite?token=${token}`;
    await navigator.clipboard.writeText(link).catch(() => null);
    setCopiedInviteId(inviteId);
    setTimeout(
      () => setCopiedInviteId((id) => (id === inviteId ? null : id)),
      1500,
    );
  };

  const activeInvites = invites.filter(
    (i) => !i.acceptedAt && new Date(i.expiresAt) > new Date(),
  );

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {activeHousehold.name}
        </h1>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowRename(true)}
        >
          ✏️ {t('household.rename')}
        </Button>
      </div>

      {/* Members */}
      <Section title={t('household.members')}>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
          {members.map((m) => {
            const profile = userById.get(m.userId);
            const displayName = profile?.displayName ?? shortId(m.userId);
            return (
              <div
                key={m.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    name={displayName}
                    avatarUrl={profile?.avatarUrl ?? null}
                  />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                      <span className="truncate">{displayName}</span>
                      <RoleBadge role={m.role} />
                    </p>
                    <p className="font-mono text-xs text-gray-400 dark:text-gray-500">
                      {shortId(m.userId)}
                    </p>
                  </div>
                </div>
                {m.role !== 'owner' && (
                  <button
                    onClick={() => removeMember.mutate(m.id)}
                    className="text-xs text-red-400 hover:text-red-600 shrink-0 ml-3 dark:text-red-400 dark:hover:text-red-300"
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <Button size="sm" onClick={() => setShowInvite(true)} className="mt-3">
          + {t('household.inviteByEmail')}
        </Button>
      </Section>

      {/* Pending invites */}
      {activeInvites.length > 0 && (
        <Section title={t('household.invites')}>
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
            {activeInvites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {inv.email}
                  </p>
                  <p className="text-xs capitalize text-gray-400 dark:text-gray-500">
                    {t(`household.roles.${inv.role}`)} ·{' '}
                    {t('household.expiresOn', {
                      date: formatDate(inv.expiresAt),
                    })}
                  </p>
                  {copiedInviteId === inv.id && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {t('household.linkCopied')}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={() => void copyInviteLink(inv.id, inv.token)}
                    className="text-xs text-primary-600 hover:underline dark:text-primary-400"
                  >
                    {t('household.copyLink')}
                  </button>
                  <button
                    onClick={() => revokeInvite.mutate(inv.id)}
                    className="text-xs text-red-400 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                  >
                    {t('household.revokeInvite')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Danger zone */}
      {households.length > 1 && (
        <Section title={t('household.danger')}>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
            <p className="mb-3 text-sm text-red-700 dark:text-red-300">
              This will permanently delete the household and all its data.
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm('Are you sure? This cannot be undone.'))
                  deleteHousehold.mutate();
              }}
            >
              {t('household.deleteHome')}
            </Button>
          </div>
        </Section>
      )}

      {showInvite && (
        <InviteModal
          hid={hid}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            qc.invalidateQueries({ queryKey: ['invites', hid] });
            setShowInvite(false);
          }}
        />
      )}

      {showRename && (
        <RenameModal
          hid={hid}
          currentName={activeHousehold.name}
          onClose={() => setShowRename(false)}
          onRenamed={(updated) => {
            setActiveHousehold(updated);
            refetch();
            setShowRename(false);
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h2>
      {children}
    </div>
  );
}

/**
 * Short, monospace representation of a userId — first 8 chars + ellipsis.
 * Used both as the secondary line under the display name and as the fallback
 * display name when the auth service returns no profile for an id.
 */
function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

/**
 * 32 x 32 circular avatar. Falls back to the first letter of the display name
 * on a coloured background when no image URL is available (or the image fails
 * to load).
 */
function Avatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const [broken, setBroken] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl && !broken) {
    return (
      <img
        src={avatarUrl}
        alt=""
        onError={() => setBroken(true)}
        className="h-8 w-8 shrink-0 rounded-full object-cover bg-gray-100 dark:bg-gray-800"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
    >
      {initial}
    </span>
  );
}

function InviteModal({
  hid,
  onClose,
  onInvited,
}: {
  hid: string;
  onClose: () => void;
  onInvited: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('member');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const invite = await householdsApi.createInvite(hid, email, role, hid);
      const link = `${window.location.origin}/invite?token=${invite.token}`;
      await navigator.clipboard.writeText(link).catch(() => null);
      setCopied(true);
      setTimeout(onInvited, 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('household.inviteByEmail')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={t('household.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="partner@example.com"
        />
        <Select
          label={t('household.role')}
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`household.roles.${r}`)}
            </option>
          ))}
        </Select>
        {copied && (
          <p className="text-sm text-green-600 dark:text-green-400">
            ✓ Invite link copied to clipboard!
          </p>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? '…' : t('household.invite')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RenameModal({
  hid,
  currentName,
  onClose,
  onRenamed,
}: {
  hid: string;
  currentName: string;
  onClose: () => void;
  onRenamed: (h: Awaited<ReturnType<typeof householdsApi.update>>) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name === currentName) return;
    setSaving(true);
    try {
      const updated = await householdsApi.update(hid, hid, name.trim());
      onRenamed(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('household.rename')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={t('household.title')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={saving || !name.trim() || name === currentName}
          >
            {saving ? '…' : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
