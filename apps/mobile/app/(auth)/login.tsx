import { Link } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';

export default function LoginScreen() {
  const { signIn } = useAuth();
  return (
    <Screen title="Sign in" subtitle="Placeholder — real auth lands under #28">
      <PrimaryButton label="Continue" onPress={signIn} />
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
