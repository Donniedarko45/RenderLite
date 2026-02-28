import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { deploymentsApi } from '../api/client';
import { subscribeToDeployment } from '../api/socket';
import { PageTransition } from '../components/PageTransition';
import { AnimatedCard } from '../components/AnimatedCard';
import { Skeleton } from '../components/Skeleton';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  Activity,
  Clock,
  GitCommit,
  ExternalLink,
  ChevronRight,
  Copy,
  Lock,
  Unlock
} from 'lucide-react';
import { toast } from 'sonner';

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'renderlite.local';

const statusColors: Record<string, string> = {
  QUEUED: 'bg-white/10 text-gray-300 border border-white/10',
  BUILDING: 'bg-blue-500/20 text-blue-400 border border-blue-500/20',
  SUCCESS: 'bg-green-500/20 text-[#00ff00] border border-green-500/20',
  FAILED: 'bg-red-500/20 text-[#ff003c] border border-red-500/20',
};

const statusIcons: Record<string, React.ReactNode> = {
  QUEUED: <Clock className="w-5 h-5 text-gray-500" />,
  BUILDING: <Activity className="w-5 h-5 text-[#0070f3] animate-pulse" />,
  SUCCESS: <CheckCircle className="w-5 h-5 text-[#00ff00]" />,
  FAILED: <XCircle className="w-5 h-5 text-[#ff003c]" />,
};

export default function DeploymentDetail() {
  const { deploymentId } = useParams<{ deploymentId: string }>();
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [currentStatus, setCurrentStatus] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { data: deployment, isLoading, refetch } = useQuery({
    queryKey: ['deployment', deploymentId],
    queryFn: () => deploymentsApi.get(deploymentId!).then((res) => res.data),
    enabled: !!deploymentId,
  });

  const { data: logsData } = useQuery({
    queryKey: ['deployment-logs', deploymentId],
    queryFn: () => deploymentsApi.getLogs(deploymentId!).then((res) => res.data),
    enabled: !!deploymentId,
    refetchInterval: currentStatus === 'BUILDING' ? 2000 : false,
  });

  // Subscribe to real-time logs
  useEffect(() => {
    if (!deploymentId) return;

    const unsubscribe = subscribeToDeployment(
      deploymentId,
      (data) => {
        setLiveLogs((prev) => [...prev, data.log]);
      },
      (data) => {
        setCurrentStatus(data.status);
        if (data.status === 'SUCCESS' || data.status === 'FAILED') {
          refetch();
        }
      }
    );

    return unsubscribe;
  }, [deploymentId, refetch]);

  // Update status from deployment data
  useEffect(() => {
    if (deployment?.status) {
      setCurrentStatus(deployment.status);
    }
  }, [deployment]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveLogs, logsData, autoScroll]);

  // Parse logs for display
  const formatLogs = (logs: string) => {
    if (!logs) return [];
    return logs.split('\n').filter((line) => line.trim());
  };

  const allLogs = Array.from(
    new Set([...formatLogs(logsData?.logs || ''), ...liveLogs])
  );

  const getLogLineClass = (line: string) => {
    if (line.includes('[ERROR]') || line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) {
      return 'text-[#ff5f56]';
    }
    if (line.includes('Done:') || line.toLowerCase().includes('success')) {
      return 'text-[#27c93f]';
    }
    if (line.includes('[WARN]') || line.toLowerCase().includes('warning')) {
      return 'text-[#ffbd2e]';
    }
    if (line.includes('==>') || line.includes('Info:')) {
      return 'text-[#3b82f6]';
    }
    if (line.includes('STEP')) {
      return 'text-white font-bold bg-white/10 px-2 py-0.5 rounded inline-block mt-2 mb-1';
    }
    return 'text-gray-300';
  };

  if (isLoading) {
    return (
      <PageTransition>
        <div className="mb-8">
          <Skeleton className="h-6 w-32 mb-6" />
          <div className="flex justify-between">
            <div>
              <Skeleton className="h-10 w-64 mb-2" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <Skeleton className="h-32 w-full mb-8" />
        <Skeleton className="h-96 w-full" />
      </PageTransition>
    );
  }

  if (!deployment) {
    return <div className="text-center py-12 text-gray-500">Deployment not found</div>;
  }

  return (
    <PageTransition>
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center text-sm text-gray-400 mb-6 font-medium space-x-2">
          <Link to="/projects" className="hover:text-white transition-colors">Projects</Link>
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <Link to={`/projects/${deployment?.service?.project?.id}`} className="hover:text-white transition-colors">{deployment?.service?.project?.name}</Link>
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <Link to={`/services/${deployment?.service?.id}`} className="hover:text-white transition-colors">{deployment?.service?.name}</Link>
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <span className="text-gray-200">Deployment #{deployment?.id?.substring(0, 8)}</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center space-x-4">
              <motion.h1 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-tight"
              >
                Deployment
              </motion.h1>
              <span
                className={`px-3 py-1.5 text-xs font-semibold tracking-wider rounded-md ${
                  statusColors[currentStatus || deployment?.status || 'QUEUED']
                }`}
              >
                {currentStatus || deployment?.status || 'QUEUED'}
              </span>
            </div>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex flex-wrap items-center gap-5 mt-4 text-sm text-gray-400 font-medium"
            >
              {deployment?.commitSha && (
                <span className="flex items-center font-mono bg-white/5 px-2.5 py-1 rounded-md border border-white/10">
                  <GitCommit className="w-4 h-4 mr-1.5" />
                  {deployment.commitSha.substring(0, 7)}
                </span>
              )}
              <span className="flex items-center">
                <Clock className="w-4 h-4 mr-1.5 text-gray-500" />
                Started: {deployment?.createdAt ? new Date(deployment.createdAt).toLocaleString() : 'Loading...'}
              </span>
              {deployment?.finishedAt && (
                <span className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-1.5 text-gray-500" />
                  Finished: {new Date(deployment.finishedAt).toLocaleString()}
                </span>
              )}
            </motion.div>
          </div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center space-x-4 bg-[#111]/80 backdrop-blur-sm border border-white/10 px-5 py-3 rounded-xl shadow-inner"
          >
            {statusIcons[currentStatus || deployment?.status || 'QUEUED']}
            {(currentStatus || deployment?.status) === 'SUCCESS' && (
              <a
                href={`http://${deployment?.service?.subdomain}.${BASE_DOMAIN}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-sm font-medium text-white hover:text-gray-300 ml-4 border-l border-white/10 pl-4 transition-colors group"
              >
                <ExternalLink className="w-4 h-4 mr-2 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
                View App
              </a>
            )}
          </motion.div>
        </div>
      </div>

      {/* Service Info */}
      <AnimatedCard delay={0.3} className="mb-8">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-5">Service Info</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-[10px] text-gray-500 mb-1.5 uppercase font-bold tracking-widest">Service</p>
              <p className="font-semibold text-white text-base">{deployment?.service?.name}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-1.5 uppercase font-bold tracking-widest">Repository</p>
              <a
                href={deployment?.service?.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-white text-base hover:underline decoration-white/30 underline-offset-4 transition-all"
              >
                View on GitHub
              </a>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-1.5 uppercase font-bold tracking-widest">Branch</p>
              <p className="font-semibold text-white text-base font-mono">{deployment?.service?.branch}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-1.5 uppercase font-bold tracking-widest">Subdomain</p>
              <p className="font-semibold text-white text-base font-mono">{deployment?.service?.subdomain}</p>
            </div>
        </div>
      </AnimatedCard>

      {/* Logs */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-[#0a0a0a] rounded-xl border border-white/10 overflow-hidden shadow-2xl"
      >
        <div className="px-6 py-4 border-b border-white/10 bg-[#111] flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
              <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
            </div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-4">
              Terminal
            </h2>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${autoScroll ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
            >
              {autoScroll ? <Lock className="w-3 h-3 mr-1.5" /> : <Unlock className="w-3 h-3 mr-1.5" />}
              Auto-scroll
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(allLogs.join('\n'));
                toast.success('Logs copied to clipboard');
              }}
              className="flex items-center px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
            >
              <Copy className="w-3 h-3 mr-1.5" />
              Copy
            </button>
          </div>
        </div>
        <div className="log-viewer h-[600px] border-none rounded-none p-6 font-mono text-[13px] leading-relaxed custom-scrollbar selection:bg-white/20 selection:text-white overflow-y-auto">
          {allLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-20">
              <Activity className="w-10 h-10 text-gray-600 mb-4 animate-pulse" />
              <p className="text-gray-400 font-medium font-sans">
                {currentStatus === 'QUEUED'
                  ? 'Waiting for build to start...'
                  : 'Initializing build environment...'}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {allLogs.map((line, index) => (
                <div key={index} className={`log-line ${getLogLineClass(line)} hover:bg-white/[0.02] -mx-2 px-2 rounded transition-colors`}>
                  {line}
                </div>
              ))}
              <div ref={logsEndRef} className="h-4" />
            </div>
          )}
        </div>
      </motion.div>
    </PageTransition>
  );
}
