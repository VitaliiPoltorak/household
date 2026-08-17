import { useState, useRef, useEffect } from 'react';

/**
 * Double-click-to-edit name behaviour shared by AccountCard (grid view) and
 * AccountRow (list view). Owns the local editing flag, the draft value, and
 * an input ref that auto-selects on entry.
 *
 * Callers render either the readonly node (attach `enter()` to onDoubleClick)
 * or the input (spread `inputProps`). `save()` calls `onSave(trimmed)` only
 * when the value actually changed — the trimmed empty string is ignored so
 * an accidental blur doesn't wipe the name.
 */
export function useInlineNameEdit(current: string, onSave: (next: string) => void) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Keep the draft in sync when the underlying name changes from outside
  // (e.g. a successful save invalidates the query and re-renders with a
  // fresh account object) — otherwise entering edit mode would show a
  // stale draft.
  useEffect(() => {
    if (!editing) setDraft(current);
  }, [current, editing]);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== current) onSave(trimmed);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(current);
    setEditing(false);
  };

  return {
    editing,
    enter: () => setEditing(true),
    inputProps: {
      ref: inputRef,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
      onBlur: save,
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') cancel();
      },
    },
  };
}
