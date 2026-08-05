import { useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';

export function useEditing(entity: string, entityId: string) {
  const { emitEditingStart, emitEditingStop } = useSocket();

  const onFocus = useCallback(() => emitEditingStart(entity, entityId), [emitEditingStart, entity, entityId]);
  const onBlur  = useCallback(() => emitEditingStop(entity, entityId),  [emitEditingStop,  entity, entityId]);

  return { onFocus, onBlur };
}
