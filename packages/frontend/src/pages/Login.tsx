import { Github } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = () => {
    window.location.href = '/auth/github';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-3xl">R</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to RenderLite</h1>
          <p className="text-gray-600 mt-2">
            Deploy your backend applications with ease
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
          >
            <Github className="w-5 h-5 mr-2" />
            Continue with GitHub
          </button>
        </div>

        <div className="mt-8 pt-6 border-t text-center">
          <p className="text-sm text-gray-500">
            By continuing, you agree to RenderLite's Terms of Service and Privacy Policy
          </p>
        </div>

        <div className="mt-8">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Features</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-primary-500 rounded-full mr-2"></span>
              Deploy from GitHub repositories
            </li>
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-primary-500 rounded-full mr-2"></span>
              Automatic container builds with Nixpacks
            </li>
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-primary-500 rounded-full mr-2"></span>
              Real-time deployment logs
            </li>
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-primary-500 rounded-full mr-2"></span>
              Container metrics monitoring
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
