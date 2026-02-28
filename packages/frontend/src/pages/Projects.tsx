import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { projectsApi } from '../api/client';
import { PageTransition } from '../components/PageTransition';
import { AnimatedCard } from '../components/AnimatedCard';
import { Skeleton } from '../components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, FolderKanban, Server, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const projectSchema = z.object({
  name: z.string().min(3, 'Project name must be at least 3 characters').max(50, 'Project name must be less than 50 characters').regex(/^[a-z0-9-]+$/, 'Project name can only contain lowercase letters, numbers, and dashes'),
});

type ProjectFormData = z.infer<typeof projectSchema>;

export default function Projects() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
  });

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => projectsApi.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreateModal(false);
      reset();
      toast.success('Project created successfully');
    },
    onError: () => {
      toast.error('Failed to create project');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeleteProjectId(null);
      toast.success('Project deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete project');
    }
  });

  const onSubmit = (data: ProjectFormData) => {
    createMutation.mutate(data.name);
  };

  return (
    <PageTransition>
      <div className="flex items-center justify-between mb-10">
        <div>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-tight"
          >
            Projects
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-gray-400 mt-2 font-medium"
          >
            Manage your deployment projects
          </motion.p>
        </div>
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 transition-all duration-300 font-medium active:scale-95"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Project
        </motion.button>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#111] rounded-xl border border-white/10 p-6 h-48">
              <Skeleton className="h-10 w-10 mb-4 rounded-lg" />
              <Skeleton className="h-6 w-3/4 mb-4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : projects?.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 border border-dashed border-white/20 rounded-2xl bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] backdrop-blur-sm relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-[#111] to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center mx-auto mb-6 shadow-2xl">
              <FolderKanban className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold text-white tracking-tight">No projects found</h3>
            <p className="text-gray-400 mt-3 text-base max-w-sm mx-auto">
              Get started by creating your first project. Projects help you organize your services and databases.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-8 px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-200 font-medium transition-colors active:scale-95"
            >
              Create New Project
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {projects?.map((project: any, i: number) => (
              <AnimatedCard key={project.id} delay={i * 0.1} className="!p-0 h-full flex flex-col">
                <Link to={`/projects/${project.id}`} className="block p-6 flex-1">
                  <div className="flex items-start justify-between">
                    <div className="p-3 bg-white/5 rounded-lg border border-white/10 group-hover:border-white/20 transition-colors shadow-inner">
                      <FolderKanban className="w-6 h-6 text-gray-300 group-hover:text-white transition-colors" />
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setDeleteProjectId(project.id);
                      }}
                      className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all duration-300 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <h3 className="text-xl font-bold text-white mt-5 tracking-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-400 transition-all">
                    {project.name}
                  </h3>
                  <div className="flex items-center text-sm text-gray-400 mt-3 font-medium">
                    <Server className="w-4 h-4 mr-2" />
                    {project._count?.services || 0} services
                  </div>
                  <p className="text-xs text-gray-500 mt-6 font-mono">
                    Created {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                </Link>
              </AnimatedCard>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.4 }}
              className="bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <h2 className="text-2xl font-bold text-white mb-6 tracking-tight">
                Create New Project
              </h2>
              <form onSubmit={handleSubmit(onSubmit)}>
                <div>
                  <input
                    type="text"
                    {...register('name')}
                    placeholder="project-name"
                    className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none"
                    autoFocus
                  />
                  {errors.name && (
                    <motion.p 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-red-400 text-sm mt-2 font-medium"
                    >
                      {errors.name.message}
                    </motion.p>
                  )}
                </div>
                <div className="flex justify-end space-x-3 mt-8">
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
                    disabled={createMutation.isPending}
                    className="px-5 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 disabled:opacity-50 font-medium transition-all active:scale-95"
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteProjectId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-red-500/20 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4"
            >
              <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">
                Delete Project
              </h2>
              <p className="text-gray-400 mb-8 leading-relaxed">
                Are you sure you want to delete this project? This will also delete all
                services and deployments. <span className="text-red-400">This action cannot be undone.</span>
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setDeleteProjectId(null)}
                  className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors font-medium rounded-lg hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteMutation.mutate(deleteProjectId)}
                  disabled={deleteMutation.isPending}
                  className="px-5 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 font-medium transition-all active:scale-95"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete Project'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
