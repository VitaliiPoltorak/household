import { useEffect, useState } from 'react';

/**
 * Returns `value`, but delayed by `delayMs` after the last change — used to
 * avoid firing a network request (e.g. product-name search) on every
 * keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
