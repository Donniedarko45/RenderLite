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
      color: 'bg-blue-500',
    },
    {
      name: 'Services',
      value: overview?.services || 0,
      icon: Server,
      color: 'bg-purple-500',
    },
    {
      name: 'Running',
      value: overview?.runningServices || 0,
      icon: Activity,
      color: 'bg-green-500',
    },
    {
      name: 'Deployments',
      value: Object.values(overview?.deployments || {}).reduce((a: number, b: any) => a + b, 0),
      icon: CheckCircle,
      color: 'bg-orange-500',
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'FAILED':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'BUILDING':
        return <Activity className="w-5 h-5 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Overview of your deployments and services</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="bg-white rounded-xl shadow-sm p-6 border border-gray-100"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.name}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {overviewLoading ? '-' : stat.value}
                </p>
              </div>
              <div className={`p-3 rounded-lg ${stat.color}`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Deployments */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Deployments</h2>
          <Link
            to="/projects"
            className="text-sm text-primary-600 hover:text-primary-700 flex items-center"
          >
            View all
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
        <div className="divide-y">
          {deploymentsLoading ? (
            <div className="p-6 text-center text-gray-500">Loading...</div>
          ) : recentDeployments?.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No deployments yet. Create a service to get started!
            </div>
          ) : (
            recentDeployments?.map((deployment: any) => (
              <Link
                key={deployment.id}
                to={`/deployments/${deployment.id}`}
                className="flex items-center px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                {getStatusIcon(deployment.status)}
                <div className="ml-4 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {deployment.service?.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {deployment.commitSha?.substring(0, 7) || 'No commit'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-900">{deployment.status}</p>
                  <p className="text-xs text-gray-500">
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
