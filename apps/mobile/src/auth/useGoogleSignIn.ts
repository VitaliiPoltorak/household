import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

// Completes the auth session when the OS hands control back to the app.
WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = Platform.select({
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
});

/** Whether a native Google client is configured for this platform. */
export const isGoogleSignInConfigured = !!CLIENT_ID;

/**
 * Google sign-in via the OIDC code + PKCE flow (expo-auth-session's
 * `providers/google` helper is deprecated). Native Google clients take no
 * client secret and redirect to `<reverse-client-id>:/oauthredirect`.
 * Resolves the Google ID token — auth-service validates it against
 * GOOGLE_MOBILE_CLIENT_IDS — or null if the user dismissed the prompt.
 */
export function useGoogleSignIn() {
  const [busy, setBusy] = useState(false);
  const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');

  const signIn = useCallback(async (): Promise<string | null> => {
    if (!CLIENT_ID || !discovery) return null;
    setBusy(true);
    try {
      const redirectUri = AuthSession.makeRedirectUri({
        native: `com.googleusercontent.apps.${CLIENT_ID.replace('.apps.googleusercontent.com', '')}:/oauthredirect`,
      });
      const request = new AuthSession.AuthRequest({
        clientId: CLIENT_ID,
        redirectUri,
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
      });
      const result = await request.promptAsync(discovery);
      if (result.type !== 'success') return null;
      const tokens = await AuthSession.exchangeCodeAsync(
        {
          clientId: CLIENT_ID,
          code: result.params['code'],
          redirectUri,
          extraParams: { code_verifier: request.codeVerifier ?? '' },
        },
        discovery,
      );
      return tokens.idToken ?? null;
    } finally {
      setBusy(false);
    }
  }, [discovery]);

  return { signIn, busy, ready: !!discovery && isGoogleSignInConfigured };
}
