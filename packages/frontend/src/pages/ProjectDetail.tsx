import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, servicesApi, deploymentsApi } from '../api/client';
import { PageTransition } from '../components/PageTransition';
import { AnimatedCard } from '../components/AnimatedCard';
import { Skeleton } from '../components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Plus,
  Server,
  GitBranch,
  ExternalLink,
  Play,
  Trash2,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const serviceSchema = z.object({
  name: z.string().min(3, 'Service name must be at least 3 characters').regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, and dashes only'),
  repoUrl: z.string().url('Must be a valid URL').startsWith('https://github.com/', 'Must be a GitHub repository URL'),
  branch: z.string().min(1, 'Branch name is required'),
});

type ServiceFormData = z.infer<typeof serviceSchema>;

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'renderlite.local';

const statusColors: Record<string, string> = {
  CREATED: 'bg-white/10 text-gray-300 border border-white/10',
  DEPLOYING: 'bg-blue-500/20 text-blue-400 border border-blue-500/20',
  RUNNING: 'bg-green-500/20 text-[#00ff00] border border-green-500/20',
  STOPPED: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/20',
  FAILED: 'bg-red-500/20 text-[#ff003c] border border-red-500/20',
};

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      branch: 'main'
    }
  });

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!).then((res) => res.data),
    enabled: !!projectId,
  });

  const createServiceMutation = useMutation({
    mutationFn: (data: any) => servicesApi.create({ ...data, projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowCreateModal(false);
      reset();
      toast.success('Service created successfully');
    },
    onError: () => {
      toast.error('Failed to create service');
    }
  });

  const deployMutation = useMutation({
    mutationFn: (serviceId: string) => deploymentsApi.trigger(serviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Deployment triggered');
    },
    onError: () => {
      toast.error('Failed to trigger deployment');
    }
  });

  const deleteServiceMutation = useMutation({
    mutationFn: (serviceId: string) => servicesApi.delete(serviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Service deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete service');
    }
  });

  const onSubmit = (data: ServiceFormData) => {
    createServiceMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <PageTransition>
        <div className="mb-8">
          <Skeleton className="h-6 w-32 mb-6" />
          <div className="flex justify-between">
            <div>
              <Skeleton className="h-10 w-64 mb-2" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </PageTransition>
    );
  }

  if (!project) {
    return <div className="text-center py-12 text-gray-500">Project not found</div>;
  }

  return (
    <PageTransition>
      {/* Header */}
      <div className="mb-10">
        <Link
          to="/projects"
          className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-6 transition-all hover:-translate-x-1"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Projects
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <motion.h1 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-tight"
            >
              {project.name}
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-gray-400 mt-2 text-lg"
            >
              {project.services?.length || 0} services
            </motion.p>
          </div>
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center px-5 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 transition-all font-medium active:scale-95"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Service
          </motion.button>
        </div>
      </div>

      {/* Services List */}
      {project.services?.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] border border-dashed border-white/20 rounded-2xl relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-[#111] to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center mx-auto mb-6 shadow-2xl">
              <Server className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold text-white tracking-tight">No services yet</h3>
            <p className="text-gray-400 mt-3 text-base max-w-md mx-auto">
              Deploy your first application from a GitHub repository to get started with {project.name}.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-8 px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-200 font-medium transition-colors active:scale-95"
            >
              <Plus className="w-5 h-5 mr-2 inline-block -mt-0.5" />
              New Service
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-6">
          <AnimatePresence>
            {project.services?.map((service: any, i: number) => (
              <AnimatedCard key={service.id} delay={i * 0.1} className="p-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex items-start space-x-5">
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10 hidden md:block shadow-inner">
                      <Server className="w-6 h-6 text-gray-300" />
                    </div>
                    <div>
                      <Link
                        to={`/services/${service.id}`}
                        className="text-2xl font-bold text-white hover:text-transparent hover:bg-clip-text hover:bg-gradient-to-r hover:from-white hover:to-gray-400 tracking-tight transition-all"
                      >
                        {service.name}
                      </Link>
            <div className="flex items-center text-sm text-gray-400 mt-3 font-semibold tracking-wide">
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
                      </div>
                      <p className="text-sm text-gray-500 mt-3 font-mono bg-black/50 px-3 py-1.5 rounded-md border border-white/5 inline-block">
                        {`${service.subdomain}.${BASE_DOMAIN}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span
                      className={`px-3 py-1.5 text-xs font-semibold tracking-wider rounded-md ${
                        statusColors[service.status] || statusColors.CREATED
                      }`}
                    >
                      {service.status}
                    </span>
                    <button
                      onClick={() => deployMutation.mutate(service.id)}
                      disabled={deployMutation.isPending || service.status === 'DEPLOYING'}
                      className="p-2 text-white bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg disabled:opacity-50 transition-all active:scale-95"
                      title="Deploy"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this service?')) {
                          deleteServiceMutation.mutate(service.id);
                        }
                      }}
                      className="p-2 text-red-400 bg-red-400/5 border border-red-400/10 hover:bg-red-400/20 hover:text-red-300 rounded-lg transition-all active:scale-95"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Recent deployments */}
                {service.deployments?.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-white/10">
                    <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">
                      Recent Deployments
                    </p>
                    <div className="space-y-2">
                      {service.deployments.slice(0, 3).map((deployment: any) => (
                        <Link
                          key={deployment.id}
                          to={`/deployments/${deployment.id}`}
                          className="flex items-center justify-between text-sm p-3 bg-black/30 hover:bg-white/5 rounded-lg border border-transparent hover:border-white/10 transition-all duration-300 group"
                        >
                          <div className="flex items-center">
                            {deployment.status === 'SUCCESS' && (
                              <CheckCircle className="w-4 h-4 text-[#00ff00] mr-3 rounded-full" />
                            )}
                            {deployment.status === 'FAILED' && (
                              <XCircle className="w-4 h-4 text-[#ff003c] mr-3 rounded-full" />
                            )}
                            {deployment.status === 'BUILDING' && (
                              <Activity className="w-4 h-4 text-[#0070f3] mr-3 animate-pulse rounded-full" />
                            )}
                            {deployment.status === 'QUEUED' && (
                              <Clock className="w-4 h-4 text-gray-500 mr-3" />
                            )}
                            <span className="text-gray-400 font-mono group-hover:text-white transition-colors">
                              {deployment.commitSha?.substring(0, 7) || 'No commit'}
                            </span>
                          </div>
                          <span className="text-gray-500 group-hover:text-gray-400 transition-colors">
                            {new Date(deployment.createdAt).toLocaleString()}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </AnimatedCard>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create Service Modal */}
      <AnimatePresence>
        {showCreateModal && (
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
              className="bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-lg mx-4 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <h2 className="text-2xl font-bold text-white mb-6 tracking-tight">
                Create New Service
              </h2>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Service Name
                  </label>
                  <input
                    type="text"
                    {...register('name')}
                    placeholder="my-backend-api"
                    className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none"
                    autoFocus
                  />
                  {errors.name && <p className="text-red-400 text-sm mt-2 font-medium">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    GitHub Repository URL
                  </label>
                  <input
                    type="url"
                    {...register('repoUrl')}
                    placeholder="https://github.com/username/repo"
                    className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none"
                  />
                  {errors.repoUrl && <p className="text-red-400 text-sm mt-2 font-medium">{errors.repoUrl.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Branch
                  </label>
                  <input
                    type="text"
                    {...register('branch')}
                    placeholder="main"
                    className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none"
                  />
                  {errors.branch && <p className="text-red-400 text-sm mt-2 font-medium">{errors.branch.message}</p>}
                </div>
                <div className="flex justify-end space-x-3 pt-6 border-t border-white/10 mt-8">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      reset();
                    }}
                    className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors font-medium rounded-lg hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createServiceMutation.isPending}
                    className="px-5 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 disabled:opacity-50 font-medium transition-all active:scale-95"
                  >
                    {createServiceMutation.isPending ? 'Creating...' : 'Create Service'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
