/**
 * Where the bare `/` route sends the user (#402). The route groups only expose
 * `/login`, `/dashboard` and friends, so without this a cold start lands on
 * expo-router's "Unmatched Route" screen. Kept free of react-native imports so
 * it is unit-testable under the node-only Vitest setup.
 */
export function rootRedirectHref(isSignedIn: boolean): '/dashboard' | '/login' {
  return isSignedIn ? '/dashboard' : '/login';
}
