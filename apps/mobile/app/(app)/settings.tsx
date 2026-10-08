import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  return (
    <Screen title="Settings" subtitle={user?.email}>
      {user ? <Text style={{ fontSize: 16 }}>{user.displayName}</Text> : null}
      <PrimaryButton
        label="Categories"
        variant="secondary"
        onPress={() => router.push('/categories')}
      />
      <PrimaryButton label="Sign out" onPress={signOut} />
    </Screen>
  );
}
