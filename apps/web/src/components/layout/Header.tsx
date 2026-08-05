import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="flex h-14 items-center justify-end gap-4 border-b border-gray-200 bg-white px-6">
      {user && (
        <>
          <span className="text-sm text-gray-600">{user.displayName}</span>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
              {user.displayName[0]}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Sign out
          </button>
        </>
      )}
    </header>
  );
}
