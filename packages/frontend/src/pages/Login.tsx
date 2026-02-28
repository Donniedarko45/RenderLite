import { useState } from 'react';
import { Github, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';

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
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle Static Background */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="absolute w-[800px] h-[800px] bg-gradient-to-tr from-white/[0.02] to-transparent rounded-full blur-3xl opacity-50" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8 sm:p-10 w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            className="w-16 h-16 bg-white rounded-2xl p-2 flex items-center justify-center mx-auto mb-6"
          >
            <img src="/distributed.png" alt="RenderLite" className="w-full h-full object-contain" />
          </motion.div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50 tracking-tight">RenderLite</h1>
          <p className="text-gray-400 mt-3 font-medium">
            Deploy your backend applications with ease
          </p>
        </div>

        <div className="space-y-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogin}
            className="w-full flex items-center justify-center px-4 py-3.5 bg-[#111] border border-white/20 text-white rounded-xl hover:bg-white/5 transition-colors font-medium shadow-sm"
          >
            <Github className="w-5 h-5 mr-3" />
            Continue with GitHub
          </motion.button>
          
          {DEV_AUTH_ENABLED && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDevLogin}
              disabled={isDevLoginLoading}
              className="w-full flex items-center justify-center px-4 py-3.5 bg-white text-black rounded-xl hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
            >
              <User className="w-5 h-5 mr-3" />
              {isDevLoginLoading ? 'Signing in...' : 'Continue as Demo User'}
            </motion.button>
          )}
          
          <AnimatePresence>
            {devLoginError && (
              <motion.p 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-sm text-red-400 text-center font-medium"
              >
                {devLoginError}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-10 pt-8 border-t border-white/10 text-center">
          <p className="text-xs text-gray-500 font-medium">
            By continuing, you agree to RenderLite's Terms of Service and Privacy Policy
          </p>
        </div>

        <div className="mt-8">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Features</h3>
          <ul className="space-y-3 text-sm text-gray-300">
            <motion.li initial={{ opacity:0, x:-10 }} animate={{opacity:1, x:0}} transition={{delay:0.3}} className="flex items-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full mr-3"></span>
              Deploy from GitHub repositories
            </motion.li>
            <motion.li initial={{ opacity:0, x:-10 }} animate={{opacity:1, x:0}} transition={{delay:0.4}} className="flex items-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full mr-3"></span>
              Automatic container builds with Nixpacks
            </motion.li>
            <motion.li initial={{ opacity:0, x:-10 }} animate={{opacity:1, x:0}} transition={{delay:0.5}} className="flex items-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full mr-3"></span>
              Real-time deployment logs
            </motion.li>
            <motion.li initial={{ opacity:0, x:-10 }} animate={{opacity:1, x:0}} transition={{delay:0.6}} className="flex items-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full mr-3"></span>
              Container metrics monitoring
            </motion.li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
