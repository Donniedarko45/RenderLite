import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import ServiceDetail from './pages/ServiceDetail';
import DeploymentDetail from './pages/DeploymentDetail';
import Organizations from './pages/Organizations';
import OrgDetail from './pages/OrgDetail';
import { Toaster } from 'sonner';
import { TooltipProvider } from './components/Tooltip';
import { Spinner } from './components/Spinner';
import { useEffect } from 'react';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

NProgress.configure({ 
  showSpinner: false,
  minimum: 0.1,
  speed: 400
});

function RouteProgress() {
  const location = useLocation();

  useEffect(() => {
    NProgress.start();
    const timeout = setTimeout(() => {
      NProgress.done();
    }, 300);

    return () => clearTimeout(timeout);
  }, [location]);

  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black">
        <Spinner size="lg" className="mb-4 text-white" />
        <p className="text-gray-500 font-mono text-sm tracking-widest uppercase">Initializing</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <TooltipProvider>
      <RouteProgress />
      <Toaster theme="dark" position="bottom-right" className="font-sans" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:projectId" element={<ProjectDetail />} />
          <Route path="services/:serviceId" element={<ServiceDetail />} />
          <Route path="deployments/:deploymentId" element={<DeploymentDetail />} />
          <Route path="organizations" element={<Organizations />} />
          <Route path="organizations/:orgId" element={<OrgDetail />} />
        </Route>
      </Routes>
    </TooltipProvider>
  );
}

export default App;
