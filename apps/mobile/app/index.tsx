import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth/AuthContext';
import { rootRedirectHref } from '../src/navigation/root-redirect';

// `/` has no screen of its own; RootStack returns null until the stored
// session has been tried, so isSignedIn is settled by the time this renders.
export default function Index() {
  const { isSignedIn } = useAuth();
  return <Redirect href={rootRedirectHref(isSignedIn)} />;
}
