import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationsApi } from '../../api/integrations';
import { ApiError } from '../../api/client';
import type { BankConnection } from '../../types/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { formatDate } from '../../lib/date-format';

export function BankConnectionsSection({ hid }: { hid: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showConnect, setShowConnect] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  // Keyed by connectionId — a 409 (sync in progress / rate limit) is a
  // routine, expected outcome here, not a generic failure, so it renders
  // inline next to the connection rather than as an error toast (#291).
  const [syncMessage, setSyncMessage] = useState<{
    id: string;
    message: string;
  } | null>(null);

  const { data: connections = [] } = useQuery({
    queryKey: ['bank-connections', hid],
    queryFn: () => integrationsApi.getConnections(hid),
    enabled: !!hid,
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => integrationsApi.disconnect(id, hid),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['bank-connections', hid] }),
  });

  const sync = useMutation({
    mutationFn: (id: string) => integrationsApi.sync(id, hid),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['bank-connections', hid] });
      setSyncMessage((m) => (m?.id === id ? null : m));
    },
    onError: (err: unknown, id) => {
      if (err instanceof ApiError && err.status === 409) {
        const message = err.message.toLowerCase().includes('progress')
          ? t('bankConnections.syncInProgress')
          : t('bankConnections.syncRateLimited');
        setSyncMessage({ id, message });
      }
    },
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t('bankConnections.title')}
        </h2>
        <Button size="sm" onClick={() => setShowConnect(true)}>
          + {t('bankConnections.connect')}
        </Button>
      </div>

      {connections.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('bankConnections.empty')}
        </p>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
          {connections.map((c) => (
            <div key={c.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {c.maskedPan ?? c.monobankAccountId ?? '—'}
                    </span>
                    <Badge label={c.status} />
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {c.lastSyncAt
                      ? t('bankConnections.lastSync', {
                          when: `${formatDate(c.lastSyncAt)} ${new Date(c.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                        })
                      : t('bankConnections.neverSynced')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={() => setHistoryFor(c.id)}
                    className="text-xs text-primary-600 hover:underline dark:text-primary-400"
                  >
                    {t('bankConnections.history')}
                  </button>
                  <button
                    onClick={() => sync.mutate(c.id)}
                    disabled={sync.isPending && sync.variables === c.id}
                    className="text-xs text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
                  >
                    {sync.isPending && sync.variables === c.id
                      ? t('bankConnections.syncing')
                      : t('bankConnections.syncNow')}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(t('bankConnections.disconnectConfirm')))
                        disconnect.mutate(c.id);
                    }}
                    className="text-xs text-red-400 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                  >
                    {t('bankConnections.disconnect')}
                  </button>
                </div>
              </div>
              {c.status === 'error' && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {t('bankConnections.syncFailedInline')}
                </p>
              )}
              {syncMessage?.id === c.id && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {syncMessage.message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {showConnect && (
        <ConnectMonobankModal
          hid={hid}
          onClose={() => setShowConnect(false)}
          onConnected={() => {
            qc.invalidateQueries({ queryKey: ['bank-connections', hid] });
            setShowConnect(false);
          }}
        />
      )}

      {historyFor && (
        <SyncHistoryModal
          hid={hid}
          connectionId={historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

function ConnectMonobankModal({
  hid,
  onClose,
  onConnected,
}: {
  hid: string;
  onClose: () => void;
  onConnected: (connection: BankConnection) => void;
}) {
  const { t } = useTranslation();
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const connection = await integrationsApi.connectMonobank(
        hid,
        token.trim(),
      );
      onConnected(connection);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t('bankConnections.invalidToken'));
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('bankConnections.connectTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={t('bankConnections.tokenLabel')}
          type="password"
          autoComplete="new-password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={t('bankConnections.tokenPlaceholder')}
          required
          autoFocus
        />
        <p className="-mt-2 text-xs text-gray-400 dark:text-gray-500">
          {t('bankConnections.tokenHint')}
        </p>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? t('common.saving') : t('bankConnections.connect')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SyncHistoryModal({
  hid,
  connectionId,
  onClose,
}: {
  hid: string;
  connectionId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: logs = [] } = useQuery({
    queryKey: ['bank-connection-logs', connectionId],
    queryFn: () => integrationsApi.getLogs(connectionId, hid),
  });

  return (
    <Modal title={t('bankConnections.history')} onClose={onClose}>
      {logs.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('bankConnections.historyEmpty')}
        </p>
      ) : (
        <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between py-2 text-sm"
            >
              <div>
                <p className="text-gray-900 dark:text-gray-100">
                  {formatDate(log.startedAt)}{' '}
                  {new Date(log.startedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                {log.status === 'success' && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {t('bankConnections.transactionCount', {
                      count: log.transactionsCount,
                    })}
                  </p>
                )}
                {log.status === 'failed' && log.error && (
                  <p className="text-xs text-red-500 dark:text-red-400">
                    {log.error}
                  </p>
                )}
              </div>
              <Badge label={log.status} />
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end pt-4">
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </Modal>
  );
}
