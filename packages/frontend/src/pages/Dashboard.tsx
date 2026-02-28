import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { metricsApi, deploymentsApi } from '../api/client';
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
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-gray-400 mt-2">Overview of your deployments and services</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="bg-[#111] rounded-xl p-6 border border-white/10 hover:border-white/20 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">{stat.name}</p>
                <p className="text-3xl font-bold text-white mt-2">
                  {overviewLoading ? '-' : stat.value}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                <stat.icon className="w-5 h-5 text-gray-300" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Deployments */}
      <div className="bg-[#111] rounded-xl border border-white/10 overflow-hidden">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-[#0a0a0a]">
          <h2 className="text-lg font-semibold text-white">Recent Deployments</h2>
          <Link
            to="/projects"
            className="text-sm text-gray-400 hover:text-white flex items-center transition-colors"
          >
            View all
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
        <div className="divide-y divide-white/5">
          {deploymentsLoading ? (
            <div className="p-8 text-center text-gray-500 font-medium">Loading...</div>
          ) : recentDeployments?.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No deployments yet. Create a service to get started!
            </div>
          ) : (
            recentDeployments?.map((deployment: any) => (
              <Link
                key={deployment.id}
                to={`/deployments/${deployment.id}`}
                className="flex items-center px-6 py-4 hover:bg-white/5 transition-colors group"
              >
                {getStatusIcon(deployment.status)}
                <div className="ml-4 flex-1">
                  <p className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                    {deployment.service?.name}
                  </p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    {deployment.commitSha?.substring(0, 7) || 'No commit'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-300">{deployment.status}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(deployment.createdAt).toLocaleString()}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
