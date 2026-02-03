import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { servicesApi, deploymentsApi, metricsApi } from '../api/client';
import { subscribeToService } from '../api/socket';
import {
  ArrowLeft,
  Play,
  GitBranch,
  ExternalLink,
  Cpu,
  HardDrive,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const statusColors: Record<string, string> = {
  CREATED: 'bg-gray-100 text-gray-700',
  DEPLOYING: 'bg-blue-100 text-blue-700',
  RUNNING: 'bg-green-100 text-green-700',
  STOPPED: 'bg-yellow-100 text-yellow-700',
  FAILED: 'bg-red-100 text-red-700',
};

export default function ServiceDetail() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const queryClient = useQueryClient();
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([
    { key: '', value: '' },
  ]);

  const { data: service, isLoading } = useQuery({
    queryKey: ['service', serviceId],
    queryFn: () => servicesApi.get(serviceId!).then((res) => res.data),
    enabled: !!serviceId,
  });

  const { data: metrics } = useQuery({
    queryKey: ['service-metrics', serviceId],
    queryFn: () => metricsApi.getServiceMetrics(serviceId!).then((res) => res.data),
    enabled: !!serviceId && service?.status === 'RUNNING',
    refetchInterval: 5000,
  });

  const deployMutation = useMutation({
    mutationFn: () => deploymentsApi.trigger(serviceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service', serviceId] });
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: (data: any) => servicesApi.update(serviceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service', serviceId] });
      setShowEnvModal(false);
    },
  });

  // Subscribe to real-time metrics
  useEffect(() => {
    if (!serviceId) return;

    const unsubscribe = subscribeToService(
      serviceId,
      (data) => {
        setMetricsHistory((prev) => [...prev.slice(-29), data.metrics]);
      },
      (data) => {
        queryClient.invalidateQueries({ queryKey: ['service', serviceId] });
      }
    );

    return unsubscribe;
  }, [serviceId, queryClient]);

  // Add metrics to history
  useEffect(() => {
    if (metrics?.metrics) {
      setMetricsHistory((prev) => {
        const newEntry = {
          ...metrics.metrics,
          time: new Date().toLocaleTimeString(),
        };
        return [...prev.slice(-29), newEntry];
      });
    }
  }, [metrics]);

  const handleSaveEnvVars = () => {
    const envObj = envVars
      .filter((e) => e.key.trim())
      .reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {});
    updateServiceMutation.mutate({ envVars: envObj });
  };

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (!service) {
    return <div className="text-center py-12 text-gray-500">Service not found</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          to={`/projects/${service.project.id}`}
          className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to {service.project.name}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900">{service.name}</h1>
              <span
                className={`px-3 py-1 text-xs font-medium rounded-full ${
                  statusColors[service.status]
                }`}
              >
                {service.status}
              </span>
            </div>
            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center">
                <GitBranch className="w-4 h-4 mr-1" />
                {service.branch}
              </span>
              <a
                href={service.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center hover:text-primary-600"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                Repository
              </a>
              <a
                href={`http://${service.subdomain}.renderlite.local`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center hover:text-primary-600"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                {service.subdomain}.renderlite.local
              </a>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowEnvModal(true)}
              className="flex items-center px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              <Settings className="w-5 h-5 mr-2" />
              Environment
            </button>
            <button
              onClick={() => deployMutation.mutate()}
              disabled={deployMutation.isPending || service.status === 'DEPLOYING'}
              className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              <Play className="w-5 h-5 mr-2" />
              Deploy
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Metrics */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Metrics</h2>
          {service.status !== 'RUNNING' ? (
            <div className="text-center py-8 text-gray-500">
              Service is not running. Deploy to see metrics.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center text-gray-500 mb-1">
                    <Cpu className="w-4 h-4 mr-2" />
                    CPU Usage
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {metrics?.metrics?.cpuPercent?.toFixed(1) || 0}%
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center text-gray-500 mb-1">
                    <HardDrive className="w-4 h-4 mr-2" />
                    Memory Usage
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {metrics?.metrics?.memoryPercent?.toFixed(1) || 0}%
                  </p>
                </div>
              </div>

              {metricsHistory.length > 1 && (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={metricsHistory}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="cpuPercent"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        name="CPU %"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="memoryPercent"
                        stroke="#10b981"
                        strokeWidth={2}
                        name="Memory %"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Deployments */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Deployment History
          </h2>
          {service.deployments?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No deployments yet
            </div>
          ) : (
            <div className="space-y-2">
              {service.deployments?.map((deployment: any) => (
                <Link
                  key={deployment.id}
                  to={`/deployments/${deployment.id}`}
                  className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center">
                    {deployment.status === 'SUCCESS' && (
                      <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                    )}
                    {deployment.status === 'FAILED' && (
                      <XCircle className="w-5 h-5 text-red-500 mr-3" />
                    )}
                    {deployment.status === 'BUILDING' && (
                      <Activity className="w-5 h-5 text-blue-500 mr-3 animate-pulse" />
                    )}
                    {deployment.status === 'QUEUED' && (
                      <Clock className="w-5 h-5 text-gray-400 mr-3" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {deployment.commitSha?.substring(0, 7) || 'No commit'}
                      </p>
                      <p className="text-xs text-gray-500">{deployment.status}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    {new Date(deployment.createdAt).toLocaleString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Environment Variables Modal */}
      {showEnvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Environment Variables
            </h2>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {envVars.map((env, index) => (
                <div key={index} className="flex space-x-2">
                  <input
                    type="text"
                    value={env.key}
                    onChange={(e) => {
                      const newVars = [...envVars];
                      newVars[index].key = e.target.value;
                      setEnvVars(newVars);
                    }}
                    placeholder="KEY"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    value={env.value}
                    onChange={(e) => {
                      const newVars = [...envVars];
                      newVars[index].value = e.target.value;
                      setEnvVars(newVars);
                    }}
                    placeholder="value"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => setEnvVars([...envVars, { key: '', value: '' }])}
              className="mt-3 text-sm text-primary-600 hover:text-primary-700"
            >
              + Add variable
            </button>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowEnvModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEnvVars}
                disabled={updateServiceMutation.isPending}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {updateServiceMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
