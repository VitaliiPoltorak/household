import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { authApi } from '../../src/api/auth';
import { ErrorText } from '../../src/components/ErrorText';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { mapAuthError } from '../../src/lib/auth-errors';

// Mirrors RegisterDto: strength (zxcvbn) and breach checks stay server-side.
const MIN_PASSWORD = 12;

export default function RegisterScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const name = displayName.trim();
    const mail = email.trim().toLowerCase();
    if (!name || !mail.includes('@')) {
      setError('Enter your name and a valid email.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await authApi.register({ email: mail, password, displayName: name });
      router.replace({ pathname: '/verify-email', params: { email: mail } });
    } catch (err) {
      setError(mapAuthError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Create account" subtitle="We'll email you a 6-digit code">
      <ErrorText message={error} />
      <TextField
        label="Name"
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label={`Password (min ${MIN_PASSWORD} characters)`}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <PrimaryButton label="Create account" onPress={submit} loading={busy} />
      <Link href="/login" asChild>
        <Text
          accessibilityRole="link"
          style={{ color: '#2563eb', textAlign: 'center' }}
        >
          I already have an account
        </Text>
      </Link>
    </Screen>
  );
}
