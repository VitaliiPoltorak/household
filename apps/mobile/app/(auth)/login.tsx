import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { authApi } from '../../src/api/auth';
import { useAuth } from '../../src/auth/AuthContext';
import { useGoogleSignIn } from '../../src/auth/useGoogleSignIn';
import { ErrorText } from '../../src/components/ErrorText';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { mapAuthError } from '../../src/lib/auth-errors';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const google = useGoogleSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await signIn(
        await authApi.loginWithPassword({
          email: email.trim().toLowerCase(),
          password,
        }),
      );
      // The root Stack.Protected guard swaps to the tabs on its own.
    } catch (err) {
      const mapped = mapAuthError(err);
      if (mapped.code === 'EMAIL_NOT_VERIFIED') {
        router.replace({
          pathname: '/verify-email',
          params: { email: mapped.email ?? email.trim().toLowerCase() },
        });
        return;
      }
      setError(mapped.message);
    } finally {
      setBusy(false);
    }
  };

  const submitGoogle = async () => {
    setError('');
    try {
      const idToken = await google.signIn();
      if (idToken) await signIn(await authApi.loginWithGoogle(idToken));
    } catch (err) {
      setError(mapAuthError(err).message);
    }
  };

  return (
    <Screen title="Sign in" subtitle="Welcome back to Household">
      <ErrorText message={error} />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      <PrimaryButton label="Sign in" onPress={submit} loading={busy} />
      {google.ready ? (
        <PrimaryButton
          label="Continue with Google"
          variant="secondary"
          loading={google.busy}
          onPress={submitGoogle}
        />
      ) : null}
      <Link href="/register" asChild>
        <Text
          accessibilityRole="link"
          style={{ color: '#2563eb', textAlign: 'center' }}
        >
          Create an account
        </Text>
      </Link>
    </Screen>
  );
}
