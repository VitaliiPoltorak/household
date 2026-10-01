import { Link } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';

export default function RegisterScreen() {
  const { signIn } = useAuth();
  return (
    <Screen
      title="Create account"
      subtitle="Placeholder — real auth lands under #28"
    >
      <PrimaryButton label="Continue" onPress={signIn} />
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
