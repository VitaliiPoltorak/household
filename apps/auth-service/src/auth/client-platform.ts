/**
 * Mobile clients (Phase 5, #356) have no browser cookie jar to hold the
 * HttpOnly refresh cookie — they send this header so the controller can
 * switch to returning the refresh token + session id in the response body
 * instead, for storage in expo-secure-store. Web clients never send it, so
 * the existing cookie-only flow (#60/#61) is untouched by default.
 */
export const CLIENT_PLATFORM_HEADER = 'x-client-platform';

export function isMobileClient(
  headerValue: string | string[] | undefined,
): boolean {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return value?.toLowerCase() === 'mobile';
}
