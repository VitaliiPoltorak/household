import type { TFunction } from 'i18next';

/**
 * Escape hatch for calling `t()` with a runtime-computed key.
 *
 * i18next's typed `t()` refuses arbitrary strings for good reason — a typo in
 * a static key becomes a compile error instead of a broken UI. But when a
 * lookup key comes from an API response mapper (e.g. `mapAuthError` in
 * lib/auth-errors.ts) the string is validated at the mapper boundary, not
 * at the render call site.
 *
 * Keep the surface tiny: prefer static `t('some.key')` everywhere else.
 */
export function td(t: TFunction, key: string, options?: Record<string, unknown>): string {
  return (t as unknown as (k: string, o?: Record<string, unknown>) => string)(key, options);
}
