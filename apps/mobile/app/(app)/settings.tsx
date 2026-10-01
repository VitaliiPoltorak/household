import { useAuth } from '../../src/auth/AuthContext';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';

export default function SettingsScreen() {
  const { signOut } = useAuth();
  return (
    <Screen title="Settings">
      <PrimaryButton label="Sign out" onPress={signOut} />
    </Screen>
  );
}
