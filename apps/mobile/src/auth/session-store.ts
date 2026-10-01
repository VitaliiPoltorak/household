import * as SecureStore from 'expo-secure-store';

/**
 * Refresh token + session id live in the OS keychain/keystore (#359); the
 * access token never touches disk — same rule as web (#60). Reads/writes can
 * throw (locked keychain, corrupted entry), so callers get `null` / a no-op
 * rather than a crash and fall back to the signed-out path.
 */
const KEY = 'household_session';

export interface StoredSession {
  sessionId: string;
  refreshToken: string;
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return parsed.sessionId && parsed.refreshToken
      ? { sessionId: parsed.sessionId, refreshToken: parsed.refreshToken }
      : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing useful to do — the in-memory state is already cleared.
  }
}
