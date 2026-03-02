import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { metricsApi, deploymentsApi, projectsApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { PageTransition } from '../components/PageTransition';
import { AnimatedCard } from '../components/AnimatedCard';
import { Skeleton } from '../components/Skeleton';
import { motion } from 'framer-motion';
import {
  FolderKanban,
  Server,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  Plus,
  Building2,
  Github,
  Rocket,
  Zap,
  CircleDot,
  ExternalLink,
} from 'lucide-react';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const quickActions = [
  { label: 'New project', href: '/projects', icon: Plus },
  { label: 'View projects', href: '/projects', icon: FolderKanban },
  { label: 'Organizations', href: '/organizations', icon: Building2 },
];

const gettingStartedSteps = [
  { label: 'Create a project', href: '/projects' },
  { label: 'Add a service & connect repo', href: '/projects' },
  { label: 'Trigger your first deploy', href: '/projects' },
];

export default function Dashboard() {
  const { user } = useAuth();

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: () => metricsApi.getOverview().then((res) => res.data),
  });

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then((res) => res.data),
  });

  const { data: recentDeployments, isLoading: deploymentsLoading } = useQuery({
    queryKey: ['recent-deployments'],
    queryFn: () => deploymentsApi.list().then((res) => res.data.slice(0, 5)),
  });

  const hasProjects = (overview?.projects ?? 0) > 0;
  const hasServices = (overview?.services ?? 0) > 0;
  const hasDeployments = (Object.values(overview?.deployments || {}).reduce((a: number, b: any) => a + b, 0)) > 0;
  const isEmpty = !hasProjects && !overviewLoading;

  const stats = [
    { name: 'Projects', value: overview?.projects || 0, icon: FolderKanban, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
    { name: 'Services', value: overview?.services || 0, icon: Server, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { name: 'Running', value: overview?.runningServices || 0, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { name: 'Deployments', value: Object.values(overview?.deployments || {}).reduce((a: number, b: any) => a + b, 0), icon: CheckCircle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />;
      case 'FAILED':
        return <XCircle className="w-5 h-5 text-red-400 shrink-0" />;
      case 'BUILDING':
        return <Activity className="w-5 h-5 text-blue-400 animate-pulse shrink-0" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500 shrink-0" />;
    }
  };

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto">
        {/* Hero: Welcome + Status + Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {getGreeting()},{' '}
                <span className="text-white/90">{user?.username || 'there'}</span>
              </h1>
              <p className="text-gray-400 mt-1 text-sm sm:text-base">
                Here’s what’s happening across your projects and services.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                All systems operational
              </div>
              <div className="flex gap-2">
                {quickActions.map((action) => (
                  <Link
                    key={action.label}
                    to={action.href}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/15 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 text-sm font-medium transition-colors"
                  >
                    <action.icon className="w-4 h-4 shrink-0" />
                    <span>{action.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Main column */}
          <div className="xl:col-span-2 space-y-8">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {overviewLoading ? (
                [...Array(4)].map((_, i) => (
                  <div key={i} className="dashboard-stat-card rounded-xl border border-white/10 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <Skeleton className="h-9 w-9 rounded-lg bg-white/5" />
                      <Skeleton className="h-3 w-16 bg-white/5" />
                    </div>
                    <Skeleton className="h-8 w-12 bg-white/10" />
                  </div>
                ))
              ) : (
                stats.map((stat, i) => (
                  <AnimatedCard key={stat.name} delay={i * 0.05}>
                    <Link
                      to="/projects"
                      className={`dashboard-stat-card rounded-xl border p-5 flex flex-col transition-all hover:border-white/20 block ${stat.border}`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${stat.bg} ${stat.color}`}>
                          <stat.icon className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider leading-tight">{stat.name}</p>
                      </div>
                      <p className="text-2xl font-bold text-white tabular-nums">{stat.value}</p>
                    </Link>
                  </AnimatedCard>
                ))
              )}
            </div>

            {/* Recent Projects (when we have projects) */}
            {!projectsLoading && projects && projects.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="dashboard-card rounded-xl border border-white/10 overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-300">Recent projects</h2>
                  <Link
                    to="/projects"
                    className="text-xs font-medium text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    View all <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <div className="divide-y divide-white/5">
                  {projects.slice(0, 4).map((project: any) => (
                    <Link
                      key={project.id}
                      to={`/projects/${project.id}`}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                        <FolderKanban className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200 group-hover:text-white truncate">{project.name}</p>
                        <p className="text-xs text-gray-500 font-mono">/{project.name}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-white shrink-0" />
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Recent Deployments */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="dashboard-card rounded-xl border border-white/10 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-300">Recent deployments</h2>
                <Link
                  to="/projects"
                  className="text-xs font-medium text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
                >
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="divide-y divide-white/5">
                {deploymentsLoading ? (
                  [...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-4">
                      <Skeleton className="w-5 h-5 rounded-full bg-white/10" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-28 mb-2 bg-white/10" />
                        <Skeleton className="h-3 w-16 bg-white/5" />
                      </div>
                      <Skeleton className="h-4 w-16 bg-white/10" />
                    </div>
                  ))
                ) : recentDeployments?.length === 0 ? (
                  <div className="p-10 text-center">
                    <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                      <Rocket className="w-6 h-6 text-gray-500" />
                    </div>
                    <h3 className="text-sm font-semibold text-white">No deployments yet</h3>
                    <p className="text-gray-500 mt-1 text-xs max-w-[240px] mx-auto">
                      Create a project, add a service, and deploy to see activity here.
                    </p>
                    <Link
                      to="/projects"
                      className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white text-sm font-medium transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Create project
                    </Link>
                  </div>
                ) : (
                  recentDeployments?.map((deployment: any) => (
                    <Link
                      key={deployment.id}
                      to={`/deployments/${deployment.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.03] transition-colors group"
                    >
                      {getStatusIcon(deployment.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200 group-hover:text-white truncate">
                          {deployment.service?.name}
                        </p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">
                          {deployment.commitSha?.substring(0, 7) || '—'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{deployment.status}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">
                          {new Date(deployment.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Getting started */}
            {isEmpty && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="dashboard-card rounded-xl border border-white/10 p-5"
              >
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Get started
                </h3>
                <p className="text-xs text-gray-500 mt-1 mb-4">
                  Set up your first project and deploy in minutes.
                </p>
                <ul className="space-y-2">
                  {gettingStartedSteps.map((step, i) => (
                    <li key={step.label}>
                      <Link
                        to={step.href}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/5 text-gray-400 hover:text-gray-200 text-sm transition-colors"
                      >
                        <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-xs font-medium text-gray-500">
                          {i + 1}
                        </span>
                        {step.label}
                        <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-50" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* Progress checklist when not empty */}
            {!overviewLoading && !isEmpty && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="dashboard-card rounded-xl border border-white/10 p-5"
              >
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <CircleDot className="w-4 h-4 text-emerald-400" />
                  Setup progress
                </h3>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3 text-sm">
                    {hasProjects ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-white/20 shrink-0" />}
                    <span className={hasProjects ? 'text-gray-300' : 'text-gray-500'}>Project created</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {hasServices ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-white/20 shrink-0" />}
                    <span className={hasServices ? 'text-gray-300' : 'text-gray-500'}>Service added</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {hasDeployments ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-white/20 shrink-0" />}
                    <span className={hasDeployments ? 'text-gray-300' : 'text-gray-500'}>First deploy</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Quick links / Platform */}
            <div className="dashboard-card rounded-xl border border-white/10 p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Quick links</h3>
              <div className="space-y-1">
                <Link to="/projects" className="flex items-center gap-2 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                  <FolderKanban className="w-4 h-4" /> Projects
                </Link>
                <Link to="/organizations" className="flex items-center gap-2 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                  <Building2 className="w-4 h-4" /> Organizations
                </Link>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                  <Github className="w-4 h-4" /> GitHub <ExternalLink className="w-3 h-3 opacity-50" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
