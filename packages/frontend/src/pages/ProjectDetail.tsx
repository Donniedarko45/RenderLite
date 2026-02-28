import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, servicesApi, deploymentsApi } from '../api/client';
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

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'renderlite.local';

const statusColors: Record<string, string> = {
  CREATED: 'bg-gray-100 text-gray-700',
  DEPLOYING: 'bg-blue-100 text-blue-700',
  RUNNING: 'bg-green-100 text-green-700',
  STOPPED: 'bg-yellow-100 text-yellow-700',
  FAILED: 'bg-red-100 text-red-700',
};

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    repoUrl: '',
    branch: 'main',
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
      setFormData({ name: '', repoUrl: '', branch: 'main' });
    },
  });

  const deployMutation = useMutation({
    mutationFn: (serviceId: string) => deploymentsApi.trigger(serviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: (serviceId: string) => servicesApi.delete(serviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const handleCreateService = (e: React.FormEvent) => {
    e.preventDefault();
    createServiceMutation.mutate(formData);
  };

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (!project) {
    return <div className="text-center py-12 text-gray-500">Project not found</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/projects"
          className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Projects
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <p className="text-gray-600">
              {project.services?.length || 0} services
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Service
          </button>
        </div>
      </div>

      {/* Services List */}
      {project.services?.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <Server className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No services yet</h3>
          <p className="text-gray-500 mt-1">Create a service to deploy your app</p>
        </div>
      ) : (
        <div className="space-y-4">
          {project.services?.map((service: any) => (
            <div
              key={service.id}
              className="bg-white rounded-xl shadow-sm border p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Server className="w-6 h-6 text-gray-600" />
                  </div>
                  <div>
                    <Link
                      to={`/services/${service.id}`}
                      className="text-lg font-semibold text-gray-900 hover:text-primary-600"
                    >
                      {service.name}
                    </Link>
                    <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
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
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {`${service.subdomain}.${BASE_DOMAIN}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-3 py-1 text-xs font-medium rounded-full ${
                      statusColors[service.status] || statusColors.CREATED
                    }`}
                  >
                    {service.status}
                  </span>
                  <button
                    onClick={() => deployMutation.mutate(service.id)}
                    disabled={deployMutation.isPending || service.status === 'DEPLOYING'}
                    className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg disabled:opacity-50"
                    title="Deploy"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this service?')) {
                        deleteServiceMutation.mutate(service.id);
                      }
                    }}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Recent deployments */}
              {service.deployments?.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Recent Deployments
                  </p>
                  <div className="space-y-2">
                    {service.deployments.slice(0, 3).map((deployment: any) => (
                      <Link
                        key={deployment.id}
                        to={`/deployments/${deployment.id}`}
                        className="flex items-center justify-between text-sm p-2 hover:bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center">
                          {deployment.status === 'SUCCESS' && (
                            <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                          )}
                          {deployment.status === 'FAILED' && (
                            <XCircle className="w-4 h-4 text-red-500 mr-2" />
                          )}
                          {deployment.status === 'BUILDING' && (
                            <Activity className="w-4 h-4 text-blue-500 mr-2 animate-pulse" />
                          )}
                          {deployment.status === 'QUEUED' && (
                            <Clock className="w-4 h-4 text-gray-400 mr-2" />
                          )}
                          <span className="text-gray-600">
                            {deployment.commitSha?.substring(0, 7) || 'No commit'}
                          </span>
                        </div>
                        <span className="text-gray-400">
                          {new Date(deployment.createdAt).toLocaleString()}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Service Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Create New Service
            </h2>
            <form onSubmit={handleCreateService} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="my-backend-api"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GitHub Repository URL
                </label>
                <input
                  type="url"
                  value={formData.repoUrl}
                  onChange={(e) => setFormData({ ...formData, repoUrl: e.target.value })}
                  placeholder="https://github.com/username/repo"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Branch
                </label>
                <input
                  type="text"
                  value={formData.branch}
                  onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                  placeholder="main"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createServiceMutation.isPending}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {createServiceMutation.isPending ? 'Creating...' : 'Create Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
