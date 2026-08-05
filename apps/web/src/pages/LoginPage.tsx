import { useTranslation } from 'react-i18next';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';
import { useState } from 'react';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  if (user) { navigate('/dashboard', { replace: true }); return null; }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">{t('auth.title')}</h1>
          <p className="mt-2 text-sm text-gray-500">{t('auth.subtitle')}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={async (cred) => {
              if (!cred.credential) return;
              try {
                setError('');
                const tokens = await authApi.loginWithGoogle(cred.credential);
                await login(tokens);
                navigate('/dashboard', { replace: true });
              } catch {
                setError(t('auth.loginError'));
              }
            }}
            onError={() => setError(t('auth.loginError'))}
            width="280"
          />
        </div>
      </div>
    </div>
  );
}
