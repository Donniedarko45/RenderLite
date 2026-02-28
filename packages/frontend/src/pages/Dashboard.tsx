import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { metricsApi, deploymentsApi } from '../api/client';
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
} from 'lucide-react';

export default function Dashboard() {
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: () => metricsApi.getOverview().then((res) => res.data),
  });

  const { data: recentDeployments, isLoading: deploymentsLoading } = useQuery({
    queryKey: ['recent-deployments'],
    queryFn: () => deploymentsApi.list().then((res) => res.data.slice(0, 5)),
  });

  const stats = [
    {
      name: 'Projects',
      value: overview?.projects || 0,
      icon: FolderKanban,
    },
    {
      name: 'Services',
      value: overview?.services || 0,
      icon: Server,
    },
    {
      name: 'Running',
      value: overview?.runningServices || 0,
      icon: Activity,
    },
    {
      name: 'Deployments',
      value: Object.values(overview?.deployments || {}).reduce((a: number, b: any) => a + b, 0),
      icon: CheckCircle,
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle className="w-5 h-5 text-[#00ff00]" />; // Neon Green
      case 'FAILED':
        return <XCircle className="w-5 h-5 text-[#ff003c]" />; // Neon Red
      case 'BUILDING':
        return <Activity className="w-5 h-5 text-[#0070f3] animate-pulse" />; // Vibrant Blue
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <PageTransition>
      <div className="mb-10">
        <motion.h1 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-tight"
        >
          Dashboard
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-gray-400 mt-2 text-lg"
        >
          Overview of your deployments and services
        </motion.p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {overviewLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-[#0a0a0a] rounded-xl border border-white/10 p-6 flex justify-between items-center">
                <div>
                  <Skeleton className="h-4 w-16 mb-2 bg-white/5" />
                  <Skeleton className="h-8 w-12 bg-white/10" />
                </div>
                <Skeleton className="h-12 w-12 rounded-xl bg-white/5" />
              </div>
            ))}
          </>
        ) : (
          stats.map((stat, i) => (
            <AnimatedCard key={stat.name} delay={i * 0.1}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-400">{stat.name}</p>
                  <p className="text-3xl font-bold text-white mt-2">
                    {stat.value}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <stat.icon className="w-5 h-5 text-gray-300" />
                </div>
              </div>
            </AnimatedCard>
          ))
        )}
      </div>

      {/* Recent Deployments */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card rounded-xl overflow-hidden shadow-2xl relative"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between relative z-10">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Recent Deployments</h2>
          <Link
            to="/projects"
            className="text-sm font-medium text-gray-400 hover:text-white flex items-center transition-colors hover:translate-x-1 duration-300"
          >
            View all
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
        <div className="divide-y divide-white/5 relative z-10">
          {deploymentsLoading ? (
            <div className="divide-y divide-white/5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center px-6 py-4">
                  <Skeleton className="w-5 h-5 rounded-full bg-white/10" />
                  <div className="ml-4 flex-1">
                    <Skeleton className="h-4 w-32 mb-2 bg-white/10" />
                    <Skeleton className="h-3 w-16 bg-white/5" />
                  </div>
                  <div className="text-right">
                    <Skeleton className="h-4 w-20 mb-2 ml-auto bg-white/10" />
                    <Skeleton className="h-3 w-24 ml-auto bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentDeployments?.length === 0 ? (
            <div className="p-16 text-center border border-dashed border-white/10 m-4 rounded-xl bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')]">
              <div className="w-12 h-12 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center mx-auto mb-4">
                <Activity className="w-6 h-6 text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold text-white tracking-tight">No deployments yet</h3>
              <p className="text-gray-400 mt-2 text-sm max-w-[250px] mx-auto">
                Connect your GitHub account and create a service to see your deployments here.
              </p>
            </div>
          ) : (
            recentDeployments?.map((deployment: any) => (
              <Link
                key={deployment.id}
                to={`/deployments/${deployment.id}`}
                className="flex items-center px-6 py-4 hover:bg-white/5 transition-all duration-300 group"
              >
                {getStatusIcon(deployment.status)}
                <div className="ml-4 flex-1">
                  <p className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                    {deployment.service?.name}
                  </p>
                  <p className="text-xs text-gray-500 font-mono mt-1 group-hover:text-gray-400 transition-colors">
                    {deployment.commitSha?.substring(0, 7) || 'No commit'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{deployment.status}</p>
                  <p className="text-xs text-gray-500 mt-1 font-mono">
                    {new Date(deployment.createdAt).toLocaleString()}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      </motion.div>
    </PageTransition>
  );
}
