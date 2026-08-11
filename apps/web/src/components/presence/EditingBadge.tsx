import { useEditingUser } from '../../contexts/SocketContext';

export function EditingBadge({ entity, entityId }: { entity: string; entityId: string }) {
  const editor = useEditingUser(entity, entityId);
  if (!editor) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      {editor.displayName} is editing…
    </span>
  );
}
