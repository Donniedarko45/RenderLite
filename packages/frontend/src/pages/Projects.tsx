import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { projectsApi } from '../api/client';
import { Plus, FolderKanban, Server, Trash2, MoreVertical } from 'lucide-react';

export default function Projects() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => projectsApi.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreateModal(false);
      setNewProjectName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeleteProjectId(null);
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectName.trim()) {
      createMutation.mutate(newProjectName.trim());
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Projects</h1>
          <p className="text-gray-400 mt-2">Manage your deployment projects</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Project
        </button>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : projects?.length === 0 ? (
        <div className="text-center py-12 border border-white/10 rounded-xl bg-[#111]">
          <FolderKanban className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white">No projects yet</h3>
          <p className="text-gray-400 mt-1">Create your first project to get started</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 font-medium"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects?.map((project: any) => (
            <div
              key={project.id}
              className="bg-[#111] rounded-xl border border-white/10 hover:border-white/20 transition-colors group relative"
            >
              <Link to={`/projects/${project.id}`} className="block p-6">
                <div className="flex items-start justify-between">
                  <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                    <FolderKanban className="w-6 h-6 text-gray-300" />
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setDeleteProjectId(project.id);
                    }}
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="text-xl font-semibold text-white mt-4 tracking-tight group-hover:text-gray-200 transition-colors">
                  {project.name}
                </h3>
                <div className="flex items-center text-sm text-gray-400 mt-2">
                  <Server className="w-4 h-4 mr-1" />
                  {project._count?.services || 0} services
                </div>
                <p className="text-xs text-gray-500 mt-4">
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111] border border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold text-white mb-4">
              Create New Project
            </h2>
            <form onSubmit={handleCreate}>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                className="w-full px-4 py-2 bg-black border border-white/10 rounded-lg text-white placeholder-gray-500 focus:ring-1 focus:ring-white focus:border-white transition-colors"
                autoFocus
              />
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 disabled:opacity-50 font-medium transition-colors"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111] border border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold text-white mb-2">
              Delete Project
            </h2>
            <p className="text-gray-400 mb-6">
              Are you sure you want to delete this project? This will also delete all
              services and deployments. This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteProjectId(null)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteProjectId)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium transition-colors"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
