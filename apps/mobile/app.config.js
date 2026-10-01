/**
 * Extends app.json (#359): Google's native OAuth clients redirect to a
 * reverse-client-id scheme (com.googleusercontent.apps.<id>), which must be
 * registered as a URL scheme in the native projects. The IDs are env-driven,
 * so this can't live in the static app.json.
 */
const reverseClientId = (id) =>
  id
    ? `com.googleusercontent.apps.${id.replace('.apps.googleusercontent.com', '')}`
    : null;

module.exports = ({ config }) => ({
  ...config,
  scheme: [
    config.scheme,
    reverseClientId(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
    reverseClientId(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
  ].filter(Boolean),
});
