import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
// Imported from the realtime subpath, not the package's root barrel: the
// root barrel also re-exports backend-only DTOs (class-validator decorators,
// `crypto`) that need Node/experimentalDecorators support Metro's RN preset
// doesn't have. Proves the Metro/pnpm-workspace resolution wired up in
// metro.config.js works end to end — real screens land in a later issue.
// See CLAUDE.md "Realtime Gateway pattern" for what these events carry.
import { ServerEvents } from '@household/contracts/realtime/events';
export default function App() {
  return (
    <View style={styles.container}>
      <Text>Household mobile scaffold</Text>
      <Text style={styles.subtitle}>
        @household/contracts resolved — {Object.keys(ServerEvents).length}{' '}
        realtime events available
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});
