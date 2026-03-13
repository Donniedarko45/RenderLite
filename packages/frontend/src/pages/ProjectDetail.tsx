import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, servicesApi, deploymentsApi, databasesApi } from '../api/client';
import { PageTransition } from '../components/PageTransition';
import { AnimatedCard } from '../components/AnimatedCard';
import { Skeleton } from '../components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import {
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
  MoreVertical,
  Settings,
  ChevronRight,
  Database,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../components/DropdownMenu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '../components/AlertDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/Tooltip';

const serviceSchema = z.object({
  name: z.string().min(3, 'Service name must be at least 3 characters').regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, and dashes only'),
  repoUrl: z.string().url('Must be a valid URL').startsWith('https://github.com/', 'Must be a GitHub repository URL'),
  branch: z.string().min(1, 'Branch name is required'),
});

type ServiceFormData = z.infer<typeof serviceSchema>;
type GitHubRepositoryOption = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
};

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'renderlite.local';

function toServiceSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

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
  const [deleteServiceId, setDeleteServiceId] = useState<string | null>(null);
  const [deleteServiceName, setDeleteServiceName] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbName, setDbName] = useState('');
  const [dbType, setDbType] = useState('POSTGRES');
  const [repoSearch, setRepoSearch] = useState('');

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      branch: 'main'
    }
  });
  const watchedRepoUrl = watch('repoUrl');

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!).then((res) => res.data),
    enabled: !!projectId,
  });

  const { data: githubReposResponse, isLoading: isReposLoading, isFetching: isReposFetching, refetch: refetchRepos } = useQuery({
    queryKey: ['github-repos', repoSearch],
    queryFn: () => servicesApi.listGitHubRepos(repoSearch || undefined).then((res) => res.data),
    enabled: showCreateModal,
    staleTime: 60_000,
  });
  const githubRepos: GitHubRepositoryOption[] = githubReposResponse?.repositories || [];

  const createServiceMutation = useMutation({
    mutationFn: (data: any) => servicesApi.create({ ...data, projectId }),
    onSuccess: async (response) => {
      const createdService = response.data;
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowCreateModal(false);
      setRepoSearch('');
      reset({ branch: 'main' });
      toast.success('Service created. Starting initial deployment...');
      try {
        await deploymentsApi.trigger(createdService.id);
        queryClient.invalidateQueries({ queryKey: ['project', projectId] });
        toast.success('Initial deployment started');
      } catch (error: any) {
        toast.error(error?.response?.data?.error || 'Service created, but failed to start initial deployment');
      }
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to create service');
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
      setDeleteServiceId(null);
      setConfirmName('');
      toast.success('Service deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete service');
    }
  });

  const createDbMutation = useMutation({
    mutationFn: () => databasesApi.create({ name: dbName, projectId: projectId!, type: dbType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowDbModal(false);
      setDbName('');
      toast.success('Database provisioning started');
    },
    onError: () => toast.error('Failed to create database'),
  });

  const deleteDbMutation = useMutation({
    mutationFn: (id: string) => databasesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Database deleted');
    },
    onError: () => toast.error('Failed to delete database'),
  });

  const onSubmit = (data: ServiceFormData) => {
    createServiceMutation.mutate(data);
  };

  const handleRepositorySelect = (repo: GitHubRepositoryOption) => {
    setValue('repoUrl', repo.htmlUrl, { shouldValidate: true, shouldDirty: true });
    setValue('branch', repo.defaultBranch || 'main', { shouldValidate: true, shouldDirty: true });

    const currentName = watch('name');
    if (!currentName?.trim()) {
      const suggestedName = toServiceSlug(repo.name);
      if (suggestedName) {
        setValue('name', suggestedName, { shouldValidate: true, shouldDirty: true });
      }
    }
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
        <div className="flex items-center text-sm text-gray-400 mb-6 font-medium space-x-2">
          <Link to="/projects" className="hover:text-white transition-colors">Projects</Link>
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <span className="text-gray-200">{project.name}</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <motion.h1 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-tight"
            >
              {project.name}
            </motion.h1>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-3 mt-2"
            >
              <span className="text-gray-400 text-lg">{project.services?.length || 0} services</span>
              {project.organization && (
                <Link to={`/organizations/${project.organization.id}`} className="flex items-center px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-all">
                  <Building2 className="w-3.5 h-3.5 mr-1.5" />
                  {project.organization.name}
                </Link>
              )}
            </motion.div>
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
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-3 py-1.5 text-xs font-semibold tracking-wider rounded-md ${
                        statusColors[service.status] || statusColors.CREATED
                      }`}
                    >
                      {service.status}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => deployMutation.mutate(service.id)}
                          disabled={deployMutation.isPending || service.status === 'DEPLOYING'}
                          className="p-2 text-white bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg disabled:opacity-50 transition-all active:scale-95"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Deploy Service</TooltipContent>
                    </Tooltip>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-2 text-gray-400 bg-white/5 border border-white/10 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem asChild>
                          <Link to={`/services/${service.id}`} className="w-full">
                            <Settings className="w-4 h-4 mr-2" />
                            Settings
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => {
                            setDeleteServiceId(service.id);
                            setDeleteServiceName(service.name);
                            setConfirmName('');
                          }}
                          className="text-red-400 focus:text-red-300 focus:bg-red-400/10"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Service
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm p-3 bg-black/30 hover:bg-white/5 rounded-lg border border-transparent hover:border-white/10 transition-all duration-300 group"
                        >
                          <div className="flex items-center min-w-0">
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
                            <span className="text-gray-400 font-mono group-hover:text-white transition-colors truncate">
                              {deployment.commitSha?.substring(0, 7) || 'No commit'}
                            </span>
                          </div>
                          <span className="text-gray-500 group-hover:text-gray-400 transition-colors text-xs sm:text-sm self-start sm:self-auto whitespace-nowrap">
                            {new Date(deployment.createdAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
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

      {/* Databases Section */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center">
            <Database className="w-6 h-6 mr-3 text-gray-400" />
            Databases
          </h2>
          <button onClick={() => setShowDbModal(true)} className="flex items-center px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all font-medium text-sm active:scale-95">
            <Plus className="w-4 h-4 mr-2" />
            New Database
          </button>
        </div>
        {project.databases?.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-white/10 rounded-xl text-gray-500 text-sm">
            No databases. Provision a managed Postgres, Redis, or MySQL instance.
          </div>
        ) : (
          <div className="space-y-3">
            {project.databases?.map((db: any) => (
              <AnimatedCard key={db.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="p-2.5 bg-white/5 rounded-xl border border-white/10">
                    <Database className="w-5 h-5 text-gray-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{db.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{db.type} &middot; {db.status}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2.5 py-1 text-xs font-semibold tracking-wider rounded-md ${db.status === 'RUNNING' ? 'bg-green-500/20 text-green-400 border border-green-500/20' : db.status === 'PROVISIONING' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' : 'bg-red-500/20 text-red-400 border border-red-500/20'}`}>
                    {db.status}
                  </span>
                  <button onClick={() => deleteDbMutation.mutate(db.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </AnimatedCard>
            ))}
          </div>
        )}
      </div>

      {/* Create Database Modal */}
      <AnimatePresence>
        {showDbModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <h2 className="text-2xl font-bold text-white mb-6 tracking-tight">Provision Database</h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Name</label>
                  <input type="text" value={dbName} onChange={(e) => setDbName(e.target.value)} placeholder="my-database" className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none" autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Type</label>
                  <select value={dbType} onChange={(e) => setDbType(e.target.value)} className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none">
                    <option value="POSTGRES">PostgreSQL</option>
                    <option value="REDIS">Redis</option>
                    <option value="MYSQL">MySQL</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-6 border-t border-white/10 mt-8">
                <button onClick={() => { setShowDbModal(false); setDbName(''); }} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors font-medium rounded-lg hover:bg-white/5">Cancel</button>
                <button onClick={() => createDbMutation.mutate()} disabled={!dbName || createDbMutation.isPending} className="px-5 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 disabled:opacity-50 font-medium transition-all active:scale-95">
                  {createDbMutation.isPending ? 'Creating...' : 'Provision'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-300">Import from GitHub</p>
                    <button
                      type="button"
                      onClick={() => refetchRepos()}
                      className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-all"
                    >
                      {isReposFetching ? 'Refreshing...' : 'Refresh'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    placeholder="Search your repositories..."
                    className="w-full px-3 py-2.5 bg-black border border-white/10 rounded-lg text-white placeholder-gray-600 focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none text-sm"
                  />
                  <div className="mt-3 max-h-44 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {isReposLoading ? (
                      <p className="text-xs text-gray-500 px-1 py-2">Loading repositories...</p>
                    ) : githubRepos.length === 0 ? (
                      <p className="text-xs text-gray-500 px-1 py-2">
                        {githubReposResponse?.requiresReconnect
                          ? 'No GitHub token found. Sign out and sign in with GitHub again to import repositories.'
                          : 'No repositories found. You can still paste a repository URL manually below.'}
                      </p>
                    ) : (
                      githubRepos.map((repo) => (
                        <button
                          key={repo.id}
                          type="button"
                          onClick={() => handleRepositorySelect(repo)}
                          className={`w-full text-left rounded-lg px-3 py-2.5 border transition-all ${
                            watchedRepoUrl === repo.htmlUrl
                              ? 'border-white/40 bg-white/10'
                              : 'border-white/10 bg-black hover:border-white/20 hover:bg-white/[0.03]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-white font-medium truncate">{repo.fullName}</span>
                            {repo.private && (
                              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 border border-white/20 rounded text-gray-300">
                                Private
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Default branch: {repo.defaultBranch}</p>
                        </button>
                      ))
                    )}
                  </div>
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
                      setRepoSearch('');
                      reset({ branch: 'main' });
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

      {/* Delete Confirmation Modal */}
      <AlertDialog open={!!deleteServiceId} onOpenChange={(open) => !open && setDeleteServiceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the service{' '}
              <strong className="text-white">{deleteServiceName}</strong> and all of its
              deployments and environment variables.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="my-4">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Type <strong className="text-white">{deleteServiceName}</strong> to confirm
            </label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="w-full px-4 py-2.5 bg-black border border-white/10 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-red-500/20 focus:border-red-500/30 transition-all outline-none font-mono text-sm"
              placeholder={deleteServiceName}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmName !== deleteServiceName || deleteServiceMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteServiceId) deleteServiceMutation.mutate(deleteServiceId);
              }}
            >
              {deleteServiceMutation.isPending ? 'Deleting...' : 'Delete Service'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}
