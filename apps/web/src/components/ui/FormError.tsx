/**
 * The error banner a dialog shows when its submit failed (#330).
 *
 * Same markup the auth pages already used, lifted out so every dialog reports
 * a failure the same way — and so that adding the report is one line rather
 * than a block worth skipping.
 */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300"
    >
      {message}
    </p>
  );
}
