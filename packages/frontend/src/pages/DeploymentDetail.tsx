import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { deploymentsApi } from '../api/client';
import { subscribeToDeployment } from '../api/socket';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Activity,
  Clock,
  GitCommit,
  ExternalLink,
} from 'lucide-react';

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'renderlite.local';

const statusColors: Record<string, string> = {
  QUEUED: 'bg-gray-100 text-gray-700',
  BUILDING: 'bg-blue-100 text-blue-700',
  SUCCESS: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const statusIcons: Record<string, React.ReactNode> = {
  QUEUED: <Clock className="w-5 h-5 text-gray-500" />,
  BUILDING: <Activity className="w-5 h-5 text-blue-500 animate-pulse" />,
  SUCCESS: <CheckCircle className="w-5 h-5 text-green-500" />,
  FAILED: <XCircle className="w-5 h-5 text-red-500" />,
};

export default function DeploymentDetail() {
  const { deploymentId } = useParams<{ deploymentId: string }>();
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [currentStatus, setCurrentStatus] = useState<string>('');
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
    if (deployment) {
      setCurrentStatus(deployment.status);
    }
  }, [deployment]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveLogs, logsData]);

  // Parse logs for display
  const formatLogs = (logs: string) => {
    if (!logs) return [];
    return logs.split('\n').filter((line) => line.trim());
  };

  const allLogs = Array.from(
    new Set([...formatLogs(logsData?.logs || ''), ...liveLogs])
  );

  const getLogLineClass = (line: string) => {
    if (line.includes('❌') || line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) {
      return 'text-red-400';
    }
    if (line.includes('✅') || line.toLowerCase().includes('success')) {
      return 'text-green-400';
    }
    if (line.includes('⚠️') || line.toLowerCase().includes('warning')) {
      return 'text-yellow-400';
    }
    if (line.includes('🚀') || line.includes('📦') || line.includes('📥') || line.includes('🔨') || line.includes('🐳')) {
      return 'text-blue-400';
    }
    return 'text-gray-300';
  };

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (!deployment) {
    return <div className="text-center py-12 text-gray-500">Deployment not found</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          to={`/services/${deployment.service.id}`}
          className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to {deployment.service.name}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900">Deployment</h1>
              <span
                className={`px-3 py-1 text-xs font-medium rounded-full ${
                  statusColors[currentStatus || deployment.status]
                }`}
              >
                {currentStatus || deployment.status}
              </span>
            </div>
            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
              {deployment.commitSha && (
                <span className="flex items-center">
                  <GitCommit className="w-4 h-4 mr-1" />
                  {deployment.commitSha.substring(0, 7)}
                </span>
              )}
              <span>
                Started: {new Date(deployment.createdAt).toLocaleString()}
              </span>
              {deployment.finishedAt && (
                <span>
                  Finished: {new Date(deployment.finishedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {statusIcons[currentStatus || deployment.status]}
            {(currentStatus || deployment.status) === 'SUCCESS' && (
              <a
                href={`http://${deployment.service.subdomain}.${BASE_DOMAIN}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                View App
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Service Info */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Service Info</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Service</p>
            <p className="font-medium text-gray-900">{deployment.service.name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Repository</p>
            <a
              href={deployment.service.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary-600 hover:text-primary-700"
            >
              View on GitHub
            </a>
          </div>
          <div>
            <p className="text-sm text-gray-500">Branch</p>
            <p className="font-medium text-gray-900">{deployment.service.branch}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Subdomain</p>
            <p className="font-medium text-gray-900">{deployment.service.subdomain}</p>
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Build Logs</h2>
        </div>
        <div className="log-viewer min-h-[300px]">
          {allLogs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              {currentStatus === 'QUEUED'
                ? 'Waiting for build to start...'
                : 'No logs available'}
            </div>
          ) : (
            <>
              {allLogs.map((line, index) => (
                <div key={index} className={`log-line ${getLogLineClass(line)}`}>
                  {line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
