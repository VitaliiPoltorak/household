import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { householdsApi } from '../api/households';
import type { MemberRole } from '../types/api';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

const ROLES: MemberRole[] = ['admin', 'member', 'viewer'];

export function HouseholdPage() {
  const { t } = useTranslation();
  const { activeHousehold, households, setActiveHousehold, refetch } = useHousehold();
  const qc = useQueryClient();
  const hid = activeHousehold?.id ?? '';

  const [showInvite, setShowInvite] = useState(false);
  const [showRename, setShowRename] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ['members', hid],
    queryFn: () => householdsApi.getMembers(hid, hid),
    enabled: !!hid,
  });

  const { data: invites = [] } = useQuery({
    queryKey: ['invites', hid],
    queryFn: () => householdsApi.getInvites(hid, hid),
    enabled: !!hid,
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => householdsApi.removeMember(hid, memberId, hid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', hid] }),
  });

  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) => householdsApi.deleteInvite(hid, inviteId, hid),
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

  if (!activeHousehold) return <p className="text-gray-500">Select a household first.</p>;

  const activeInvites = invites.filter((i) => !i.acceptedAt && new Date(i.expiresAt) > new Date());

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{activeHousehold.name}</h1>
        <Button size="sm" variant="secondary" onClick={() => setShowRename(true)}>
          ✏️ {t('household.rename')}
        </Button>
      </div>

      {/* Members */}
      <Section title={t('household.members')}>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{m.userId}</p>
                <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 capitalize">
                  {t(`household.roles.${m.role}`)}
                </span>
              </div>
              {m.role !== 'owner' && (
                <button
                  onClick={() => removeMember.mutate(m.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  {t('common.delete')}
                </button>
              )}
            </div>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowInvite(true)} className="mt-3">
          + {t('household.inviteByEmail')}
        </Button>
      </Section>

      {/* Pending invites */}
      {activeInvites.length > 0 && (
        <Section title={t('household.invites')}>
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {activeInvites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-gray-900">{inv.email}</p>
                  <p className="text-xs text-gray-400 capitalize">
                    {t(`household.roles.${inv.role}`)} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => revokeInvite.mutate(inv.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  {t('household.revokeInvite')}
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Danger zone */}
      {households.length > 1 && (
        <Section title={t('household.danger')}>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700 mb-3">This will permanently delete the household and all its data.</p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm('Are you sure? This cannot be undone.')) deleteHousehold.mutate();
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </div>
  );
}

function InviteModal({
  hid, onClose, onInvited,
}: { hid: string; onClose: () => void; onInvited: () => void }) {
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
      const link = `${window.location.origin}/invite/${invite.token}`;
      await navigator.clipboard.writeText(link).catch(() => null);
      setCopied(true);
      setTimeout(onInvited, 1500);
    } finally { setSaving(false); }
  };

  return (
    <Modal title={t('household.inviteByEmail')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Input label={t('household.email')} type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required placeholder="partner@example.com" />
        <Select label={t('household.role')} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
          {ROLES.map((r) => <option key={r} value={r}>{t(`household.roles.${r}`)}</option>)}
        </Select>
        {copied && <p className="text-sm text-green-600">✓ Invite link copied to clipboard!</p>}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? '…' : t('household.invite')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RenameModal({
  hid, currentName, onClose, onRenamed,
}: { hid: string; currentName: string; onClose: () => void; onRenamed: (h: Awaited<ReturnType<typeof householdsApi.update>>) => void }) {
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
    } finally { setSaving(false); }
  };

  return (
    <Modal title={t('household.rename')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Input label={t('household.title')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" className="flex-1" disabled={saving || !name.trim() || name === currentName}>
            {saving ? '…' : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
