import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  FolderKanban,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CommandMenu } from './CommandMenu';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-transparent text-gray-100 font-sans relative">
      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/80 lg:hidden backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-black/40 backdrop-blur-xl border-r border-white/5 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full relative">
          {/* Subtle gradient glow in sidebar */}
          <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-white/5 relative z-10">
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center group-hover:shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all duration-300">
                <span className="text-black font-extrabold text-lg">R</span>
              </div>
              <span className="font-extrabold text-xl text-white tracking-tight">RenderLite</span>
            </Link>
            <button
              className="lg:hidden text-gray-400 hover:text-white transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 relative z-10">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 relative group ${
                    isActive
                      ? 'text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute inset-0 bg-white/10 rounded-lg"
                      initial={false}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <span className="absolute inset-0 rounded-lg bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <item.icon className={`w-5 h-5 mr-3 relative z-10 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`} />
                  <span className="relative z-10">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-white/5 bg-black/20 relative z-10 backdrop-blur-md">
            <div className="flex items-center space-x-3 rounded-xl p-2 hover:bg-white/5 transition-all duration-300 group cursor-pointer border border-transparent hover:border-white/5">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="w-9 h-9 rounded-full border border-white/10 group-hover:border-white/20 transition-colors"
                />
              ) : (
                <div className="w-9 h-9 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center border border-white/10 group-hover:border-white/20 transition-colors">
                  <span className="text-white font-medium text-sm">
                    {user?.username?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                  {user?.username || 'User'}
                </p>
                <p className="text-xs text-gray-500 truncate group-hover:text-gray-400 transition-colors">
                  {user?.email || 'user@example.com'}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); logout(); }}
                className="p-2 text-gray-500 hover:text-white rounded-md hover:bg-white/10 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <CommandMenu />
        
        {/* Top bar (mobile only) */}
        <div className="sticky top-0 z-30 h-16 bg-black/60 backdrop-blur-md border-b border-white/5 flex items-center px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="ml-4 font-semibold text-white tracking-tight">RenderLite</span>
        </div>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-10 relative">
          {/* Subtle background glow for main content area */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[500px] bg-white/[0.02] blur-[120px] rounded-full pointer-events-none -z-10" />
          
          <div className="max-w-6xl mx-auto relative z-10">
            <AnimatePresence mode="wait">
              <Outlet key={location.pathname} />
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
