import { useState } from 'react';
import { Github, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const DEV_AUTH_ENABLED = import.meta.env.VITE_DEV_AUTH_ENABLED === 'true';

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [devLoginError, setDevLoginError] = useState('');
  const [isDevLoginLoading, setIsDevLoginLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = () => {
    window.location.href = '/auth/github';
  };

  const handleDevLogin = async () => {
    try {
      setDevLoginError('');
      setIsDevLoginLoading(true);
      const response = await api.post('/auth/dev-login');
      login(response.data.token);
      navigate('/', { replace: true });
    } catch {
      setDevLoginError('Unable to login with development auth');
    } finally {
      setIsDevLoginLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-black font-bold text-3xl">R</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Welcome to RenderLite</h1>
          <p className="text-gray-400 mt-2">
            Deploy your backend applications with ease
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center px-4 py-3 bg-[#111] border border-white/20 text-white rounded-lg hover:bg-white/5 transition-colors font-medium"
          >
            <Github className="w-5 h-5 mr-2" />
            Continue with GitHub
          </button>
          {DEV_AUTH_ENABLED && (
            <button
              onClick={handleDevLogin}
              disabled={isDevLoginLoading}
              className="w-full flex items-center justify-center px-4 py-3 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
            >
              <User className="w-5 h-5 mr-2" />
              {isDevLoginLoading ? 'Signing in...' : 'Continue as Demo User'}
            </button>
          )}
          {devLoginError && (
            <p className="text-sm text-red-400 text-center">{devLoginError}</p>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 text-center">
          <p className="text-sm text-gray-500">
            By continuing, you agree to RenderLite's Terms of Service and Privacy Policy
          </p>
        </div>

        <div className="mt-8">
          <h3 className="text-sm font-medium text-white mb-3">Features</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full mr-2"></span>
              Deploy from GitHub repositories
            </li>
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full mr-2"></span>
              Automatic container builds with Nixpacks
            </li>
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full mr-2"></span>
              Real-time deployment logs
            </li>
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full mr-2"></span>
              Container metrics monitoring
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
