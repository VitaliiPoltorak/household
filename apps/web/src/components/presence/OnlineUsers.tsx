import { useSocket } from '../../contexts/SocketContext';
import type { PresenceUser } from '../../lib/socket';

export function OnlineUsers() {
  const { onlineUsers, isConnected } = useSocket();
  if (!isConnected || onlineUsers.length === 0) return null;

  return (
    <div className="flex items-center gap-1" title={`${onlineUsers.length} online`}>
      {onlineUsers.slice(0, 5).map((u) => <Avatar key={u.userId} user={u} />)}
      {onlineUsers.length > 5 && (
        <span className="text-xs text-gray-400">+{onlineUsers.length - 5}</span>
      )}
    </div>
  );
}

function Avatar({ user }: { user: PresenceUser }) {
  const initials = user.displayName[0]?.toUpperCase() ?? '?';
  const isEditing = !!user.editingEntity;

  return (
    <div
      title={`${user.displayName}${isEditing ? ` (editing ${user.editingEntity})` : ''}`}
      className={`relative flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white ring-2 ${isEditing ? 'ring-amber-400' : 'ring-white'}`}
      style={{ backgroundColor: stringToColor(user.userId) }}
    >
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt={user.displayName} className="h-full w-full rounded-full object-cover" />
        : initials
      }
      {/* Green dot = online */}
      <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400 ring-1 ring-white" />
    </div>
  );
}

// Deterministic color from userId string
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 50%)`;
}
