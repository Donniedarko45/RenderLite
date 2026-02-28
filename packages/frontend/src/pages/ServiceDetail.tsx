import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { servicesApi, deploymentsApi, metricsApi } from '../api/client';
import { subscribeToService } from '../api/socket';
import { PageTransition } from '../components/PageTransition';
import { AnimatedCard } from '../components/AnimatedCard';
import { Skeleton } from '../components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { toast } from 'sonner';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/Tabs';

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'renderlite.local';

const statusColors: Record<string, string> = {
  CREATED: 'bg-white/10 text-gray-300 border border-white/10',
  DEPLOYING: 'bg-blue-500/20 text-blue-400 border border-blue-500/20',
  RUNNING: 'bg-green-500/20 text-[#00ff00] border border-green-500/20',
  STOPPED: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/20',
  FAILED: 'bg-red-500/20 text-[#ff003c] border border-red-500/20',
};

export default function ServiceDetail() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const queryClient = useQueryClient();
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [currentStatus, setCurrentStatus] = useState<string>('');
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
    enabled: !!serviceId && (currentStatus || service?.status) === 'RUNNING',
    refetchInterval: 5000,
  });

  const deployMutation = useMutation({
    mutationFn: () => deploymentsApi.trigger(serviceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service', serviceId] });
      toast.success('Deployment triggered');
    },
    onError: () => {
      toast.error('Failed to trigger deployment');
    }
  });

  const updateServiceMutation = useMutation({
    mutationFn: (data: any) => servicesApi.update(serviceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service', serviceId] });
      setShowEnvModal(false);
      toast.success('Service updated successfully');
    },
    onError: () => {
      toast.error('Failed to update service');
    }
  });

  // Subscribe to real-time metrics
  useEffect(() => {
    if (!serviceId) return;

    const unsubscribe = subscribeToService(
      serviceId,
      (data) => {
        setMetricsHistory((prev) => [
          ...prev.slice(-29),
          {
            ...data.metrics,
            time: new Date().toLocaleTimeString(),
          },
        ]);
      },
      (data) => {
        setCurrentStatus(data.status);
        queryClient.invalidateQueries({ queryKey: ['service', serviceId] });
      }
    );

    return unsubscribe;
  }, [serviceId, queryClient]);

  useEffect(() => {
    if (service?.status) {
      setCurrentStatus(service.status);
    }
  }, [service?.status]);

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
    return (
      <PageTransition>
        <div className="mb-8">
          <Skeleton className="h-6 w-32 mb-6" />
          <div className="flex justify-between">
            <div>
              <Skeleton className="h-10 w-64 mb-2" />
              <Skeleton className="h-5 w-48" />
            </div>
            <div className="flex space-x-3">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </PageTransition>
    );
  }

  if (!service) {
    return <div className="text-center py-12 text-gray-500">Service not found</div>;
  }

  const displayStatus = currentStatus || service.status;

  return (
    <PageTransition>
      {/* Header */}
      <div className="mb-10">
        <Link
          to={`/projects/${service.project.id}`}
          className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-6 transition-all hover:-translate-x-1"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to {service.project.name}
        </Link>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center space-x-4">
              <motion.h1 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-tight"
              >
                {service.name}
              </motion.h1>
              <span
                className={`px-3 py-1.5 text-xs font-semibold tracking-wider rounded-md ${
                  statusColors[displayStatus]
                }`}
              >
                {displayStatus}
              </span>
            </div>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex flex-wrap items-center gap-5 mt-4 text-sm text-gray-400 font-semibold tracking-wide"
            >
              <span className="flex items-center bg-white/5 px-2.5 py-1 rounded-md border border-white/10">
                <GitBranch className="w-4 h-4 mr-1.5" />
                {service.branch}
              </span>
              <a
                href={service.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4 mr-1.5" />
                Repository
              </a>
              <a
                href={`http://${service.subdomain}.${BASE_DOMAIN}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-gray-300 hover:text-white transition-colors bg-black/50 px-3 py-1 rounded-md border border-white/5"
              >
                <ExternalLink className="w-4 h-4 mr-1.5" />
                {`${service.subdomain}.${BASE_DOMAIN}`}
              </a>
            </motion.div>
          </div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center space-x-3"
          >
            <button
              onClick={() => setShowEnvModal(true)}
              className="flex items-center px-4 py-2.5 bg-transparent border border-white/20 text-white rounded-lg hover:bg-white/5 transition-all font-medium active:scale-95"
            >
              <Settings className="w-4 h-4 mr-2" />
              Environment
            </button>
            <button
              onClick={() => deployMutation.mutate()}
              disabled={deployMutation.isPending || displayStatus === 'DEPLOYING'}
              className="flex items-center px-5 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-all font-medium active:scale-95"
            >
              <Play className="w-4 h-4 mr-2" />
              Deploy
            </button>
          </motion.div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="deployments">Deployments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-6">
            {/* Metrics */}
            <AnimatedCard delay={0.3} className="flex flex-col h-[420px]">
              <h2 className="text-xl font-bold text-white mb-6 tracking-tight">Metrics</h2>
              {displayStatus !== 'RUNNING' ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 border border-dashed border-white/10 rounded-xl bg-black/30">
                  Service is not running. Deploy to see metrics.
                </div>
              ) : (
                <div className="flex-1 flex flex-col space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-5 bg-black border border-white/5 rounded-xl shadow-inner relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#0070f3]/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex items-center text-gray-400 mb-2 font-medium">
                        <Cpu className="w-4 h-4 mr-2 text-[#0070f3]" />
                        CPU Usage
                      </div>
                      <p className="text-3xl font-bold text-white tracking-tight">
                        {metrics?.metrics?.cpuPercent?.toFixed(1) || 0}<span className="text-xl text-gray-500">%</span>
                      </p>
                    </div>
                    <div className="p-5 bg-black border border-white/5 rounded-xl shadow-inner relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#00ff00]/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex items-center text-gray-400 mb-2 font-medium">
                        <HardDrive className="w-4 h-4 mr-2 text-[#00ff00]" />
                        Memory Usage
                      </div>
                      <p className="text-3xl font-bold text-white tracking-tight">
                        {metrics?.metrics?.memoryPercent?.toFixed(1) || 0}<span className="text-xl text-gray-500">%</span>
                      </p>
                    </div>
                  </div>

                  {metricsHistory.length > 1 && (
                    <div className="flex-1 min-h-[150px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={metricsHistory} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0070f3" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#0070f3" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#00ff00" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#00ff00" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                          <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#666' }} stroke="#333" axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#666' }} stroke="#333" axisLine={false} tickLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} 
                            itemStyle={{ color: '#fff' }}
                          />
                          <Area
                            type="monotone"
                            dataKey="cpuPercent"
                            stroke="#0070f3"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorCpu)"
                            name="CPU %"
                            activeDot={{ r: 4, strokeWidth: 0, fill: '#0070f3' }}
                          />
                          <Area
                            type="monotone"
                            dataKey="memoryPercent"
                            stroke="#00ff00"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorMemory)"
                            name="Memory %"
                            activeDot={{ r: 4, strokeWidth: 0, fill: '#00ff00' }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </AnimatedCard>
          </div>
        </TabsContent>

        <TabsContent value="deployments">
          {/* Deployments */}
          <AnimatedCard delay={0.1} className="flex flex-col min-h-[420px]">
            <h2 className="text-xl font-bold text-white mb-6 tracking-tight">
              Deployment History
            </h2>
            {service.deployments?.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 border border-dashed border-white/10 rounded-xl bg-black/30">
                No deployments yet
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                {service.deployments?.map((deployment: any) => (
                  <Link
                    key={deployment.id}
                    to={`/deployments/${deployment.id}`}
                    className="flex items-center justify-between p-4 bg-black border border-white/5 hover:border-white/20 rounded-xl transition-all duration-300 group hover:bg-white/[0.02]"
                  >
                    <div className="flex items-center">
                      {deployment.status === 'SUCCESS' && (
                        <CheckCircle className="w-5 h-5 text-[#00ff00] mr-4 rounded-full" />
                      )}
                      {deployment.status === 'FAILED' && (
                        <XCircle className="w-5 h-5 text-[#ff003c] mr-4 rounded-full" />
                      )}
                      {deployment.status === 'BUILDING' && (
                        <Activity className="w-5 h-5 text-[#0070f3] mr-4 animate-pulse rounded-full" />
                      )}
                      {deployment.status === 'QUEUED' && (
                        <Clock className="w-5 h-5 text-gray-500 mr-4" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors font-mono">
                          {deployment.commitSha?.substring(0, 7) || 'No commit'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-semibold">{deployment.status}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors">
                      {new Date(deployment.createdAt).toLocaleString()}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </AnimatedCard>
        </TabsContent>
      </Tabs>

      {/* Environment Variables Modal */}
      <AnimatePresence>
        {showEnvModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-2xl mx-4 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <h2 className="text-2xl font-bold text-white mb-6 tracking-tight">
                Environment Variables
              </h2>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {envVars.map((env, index) => (
                  <div key={index} className="flex space-x-3 group">
                    <input
                      type="text"
                      value={env.key}
                      onChange={(e) => {
                        const newVars = [...envVars];
                        newVars[index].key = e.target.value;
                        setEnvVars(newVars);
                      }}
                      placeholder="KEY"
                      className="flex-1 px-4 py-3 bg-black border border-white/10 rounded-xl text-white font-mono text-sm placeholder-gray-600 focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none"
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
                      className="flex-[2] px-4 py-3 bg-black border border-white/10 rounded-xl text-white font-mono text-sm placeholder-gray-600 focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={() => setEnvVars([...envVars, { key: '', value: '' }])}
                className="mt-6 px-4 py-2.5 text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/10 rounded-lg transition-all border border-white/5 w-full hover:border-white/20 active:scale-[0.98]"
              >
                + Add Variable
              </button>
              <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-white/10">
                <button
                  onClick={() => setShowEnvModal(false)}
                  className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors font-medium rounded-lg hover:bg-white/5"
                >
                  Cancel
                </button>
              <button
                onClick={handleSaveEnvVars}
                disabled={updateServiceMutation.isPending}
                className="px-5 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 disabled:opacity-50 font-medium transition-all active:scale-95"
              >
                  {updateServiceMutation.isPending ? 'Saving...' : 'Save Variables'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
