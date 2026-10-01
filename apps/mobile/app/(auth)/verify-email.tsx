import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { authApi } from '../../src/api/auth';
import { useAuth } from '../../src/auth/AuthContext';
import { ErrorText } from '../../src/components/ErrorText';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { mapAuthError } from '../../src/lib/auth-errors';

export default function VerifyEmailScreen() {
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.');
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await signIn(await authApi.verifyEmail({ email, code }));
    } catch (err) {
      setError(mapAuthError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    try {
      await authApi.resendVerification(email);
      setNotice('A new code is on its way.');
    } catch (err) {
      setError(mapAuthError(err).message);
    }
  };

  return (
    <Screen title="Verify your email" subtitle={`Code sent to ${email}`}>
      <ErrorText message={error} />
      {notice ? <Text style={{ color: '#047857' }}>{notice}</Text> : null}
      <TextField
        label="6-digit code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        onSubmitEditing={submit}
      />
      <PrimaryButton label="Verify" onPress={submit} loading={busy} />
      <PrimaryButton label="Resend code" variant="secondary" onPress={resend} />
      <Link href="/login" asChild>
        <Text
          accessibilityRole="link"
          style={{ color: '#2563eb', textAlign: 'center' }}
        >
          Back to sign in
        </Text>
      </Link>
    </Screen>
  );
}
