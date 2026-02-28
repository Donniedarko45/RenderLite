import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationsApi } from '../api/client';
import { PageTransition } from '../components/PageTransition';
import { AnimatedCard } from '../components/AnimatedCard';
import { Skeleton } from '../components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Building2, Users, FolderKanban, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const orgSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  slug: z.string().min(2).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Lowercase letters, numbers, and dashes only'),
});

type OrgFormData = z.infer<typeof orgSchema>;

const roleColors: Record<string, string> = {
  OWNER: 'bg-amber-500/20 text-amber-400 border border-amber-500/20',
  ADMIN: 'bg-purple-500/20 text-purple-400 border border-purple-500/20',
  MEMBER: 'bg-blue-500/20 text-blue-400 border border-blue-500/20',
  VIEWER: 'bg-white/10 text-gray-300 border border-white/10',
};

export default function Organizations() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { register, handleSubmit, reset, formState: { errors }, watch, setValue } = useForm<OrgFormData>({
    resolver: zodResolver(orgSchema),
  });

  const nameValue = watch('name');

  const { data: orgs, isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizationsApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: OrgFormData) => organizationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setShowCreateModal(false);
      reset();
      toast.success('Organization created');
    },
    onError: () => toast.error('Failed to create organization'),
  });

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  if (isLoading) {
    return (
      <PageTransition>
        <div className="mb-8">
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-tight">
              Organizations
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-gray-400 mt-2 text-lg">
              {orgs?.length || 0} organizations
            </motion.p>
          </div>
          <motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} onClick={() => setShowCreateModal(true)} className="flex items-center justify-center px-5 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 transition-all font-medium active:scale-95">
            <Plus className="w-5 h-5 mr-2" />
            New Organization
          </motion.button>
        </div>
      </div>

      {orgs?.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20 border border-dashed border-white/20 rounded-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-[#111] to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center mx-auto mb-6">
              <Building2 className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold text-white">No organizations</h3>
            <p className="text-gray-400 mt-3 max-w-md mx-auto">Create an organization to collaborate with your team on projects.</p>
            <button onClick={() => setShowCreateModal(true)} className="mt-8 px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-200 font-medium transition-colors active:scale-95">
              <Plus className="w-5 h-5 mr-2 inline-block -mt-0.5" />
              New Organization
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orgs?.map((org: any, i: number) => (
            <AnimatedCard key={org.id} delay={i * 0.05}>
              <Link to={`/organizations/${org.id}`} className="block group">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                    <Building2 className="w-6 h-6 text-gray-300" />
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-semibold tracking-wider rounded-md ${roleColors[org.role] || roleColors.MEMBER}`}>
                    {org.role}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-400 tracking-tight transition-all">
                  {org.name}
                </h3>
                <p className="text-sm text-gray-500 font-mono mt-1">{org.slug}</p>
                <div className="flex items-center gap-4 mt-4 text-sm text-gray-400">
                  <span className="flex items-center"><Users className="w-4 h-4 mr-1.5" />{org._count?.memberships || 0} members</span>
                  <span className="flex items-center"><FolderKanban className="w-4 h-4 mr-1.5" />{org._count?.projects || 0} projects</span>
                </div>
                <div className="flex items-center justify-end mt-4 text-gray-500 group-hover:text-white transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </Link>
            </AnimatedCard>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-lg mx-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <h2 className="text-2xl font-bold text-white mb-6 tracking-tight">Create Organization</h2>
              <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Name</label>
                  <input
                    type="text"
                    {...register('name')}
                    onChange={(e) => {
                      register('name').onChange(e);
                      setValue('slug', autoSlug(e.target.value));
                    }}
                    placeholder="My Team"
                    className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none"
                    autoFocus
                  />
                  {errors.name && <p className="text-red-400 text-sm mt-2 font-medium">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Slug</label>
                  <input
                    type="text"
                    {...register('slug')}
                    placeholder="my-team"
                    className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-white font-mono placeholder-gray-600 focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none"
                  />
                  {errors.slug && <p className="text-red-400 text-sm mt-2 font-medium">{errors.slug.message}</p>}
                </div>
                <div className="flex justify-end space-x-3 pt-6 border-t border-white/10 mt-8">
                  <button type="button" onClick={() => { setShowCreateModal(false); reset(); }} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors font-medium rounded-lg hover:bg-white/5">Cancel</button>
                  <button type="submit" disabled={createMutation.isPending} className="px-5 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 disabled:opacity-50 font-medium transition-all active:scale-95">
                    {createMutation.isPending ? 'Creating...' : 'Create'}
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
