import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationsApi } from '../api/client';
import { PageTransition } from '../components/PageTransition';
import { AnimatedCard } from '../components/AnimatedCard';
import { Skeleton } from '../components/Skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/Tabs';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Users, FolderKanban, Plus, ChevronRight, Trash2, Shield, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '../components/AlertDialog';

const roleColors: Record<string, string> = {
  OWNER: 'bg-amber-500/20 text-amber-400 border border-amber-500/20',
  ADMIN: 'bg-purple-500/20 text-purple-400 border border-purple-500/20',
  MEMBER: 'bg-blue-500/20 text-blue-400 border border-blue-500/20',
  VIEWER: 'bg-white/10 text-gray-300 border border-white/10',
};

export default function OrgDetail() {
  const { orgId } = useParams<{ orgId: string }>();
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);

  const { data: org, isLoading } = useQuery({
    queryKey: ['organization', orgId],
    queryFn: () => organizationsApi.get(orgId!).then((r) => r.data),
    enabled: !!orgId,
  });

  const inviteMutation = useMutation({
    mutationFn: () => organizationsApi.addMember(orgId!, { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      setShowInviteModal(false);
      setInviteEmail('');
      toast.success('Member invited');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to invite member'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => organizationsApi.removeMember(orgId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      setRemoveMemberId(null);
      toast.success('Member removed');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to remove member'),
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      organizationsApi.updateMemberRole(orgId!, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      toast.success('Role updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update role'),
  });

  const isOwnerOrAdmin = org?.currentUserRole === 'OWNER' || org?.currentUserRole === 'ADMIN';

  if (isLoading) {
    return (
      <PageTransition>
        <Skeleton className="h-6 w-32 mb-6" />
        <Skeleton className="h-10 w-64 mb-2" />
        <Skeleton className="h-96 w-full mt-8" />
      </PageTransition>
    );
  }

  if (!org) {
    return <div className="text-center py-12 text-gray-500">Organization not found</div>;
  }

  return (
    <PageTransition>
      <div className="mb-10">
        <div className="flex items-center text-sm text-gray-400 mb-6 font-medium space-x-2">
          <Link to="/organizations" className="hover:text-white transition-colors">Organizations</Link>
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <span className="text-gray-200">{org.name}</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-white/5 rounded-xl border border-white/10">
              <Building2 className="w-8 h-8 text-gray-300" />
            </div>
            <div>
              <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-tight">
                {org.name}
              </motion.h1>
              <p className="text-gray-500 font-mono mt-1">{org.slug}</p>
            </div>
          </div>
          <span className={`px-3 py-1.5 text-xs font-semibold tracking-wider rounded-md ${roleColors[org.currentUserRole] || roleColors.MEMBER}`}>
            {org.currentUserRole}
          </span>
        </div>
      </div>

      <Tabs defaultValue="members" className="w-full">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <AnimatedCard delay={0.1}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center">
                <Users className="w-5 h-5 mr-2 text-gray-400" />
                Members ({org.memberships?.length || 0})
              </h2>
              {isOwnerOrAdmin && (
                <button onClick={() => setShowInviteModal(true)} className="flex items-center px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 font-medium text-sm transition-all active:scale-95">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite
                </button>
              )}
            </div>
            <div className="space-y-3">
              {org.memberships?.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between p-4 bg-black border border-white/5 rounded-xl hover:border-white/10 transition-all group">
                  <div className="flex items-center space-x-4">
                    {m.user.avatarUrl ? (
                      <img src={m.user.avatarUrl} alt={m.user.username} className="w-10 h-10 rounded-full border border-white/10" />
                    ) : (
                      <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                        <span className="text-white font-medium">{m.user.username?.[0]?.toUpperCase()}</span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-white">{m.user.username}</p>
                      <p className="text-xs text-gray-500">{m.user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {org.currentUserRole === 'OWNER' && m.role !== 'OWNER' ? (
                      <select
                        value={m.role}
                        onChange={(e) => changeRoleMutation.mutate({ userId: m.user.id, role: e.target.value })}
                        className="bg-black border border-white/10 text-gray-300 text-xs rounded-lg px-3 py-1.5 focus:ring-white/20 focus:border-white/30 outline-none"
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    ) : (
                      <span className={`px-2.5 py-1 text-xs font-semibold tracking-wider rounded-md ${roleColors[m.role]}`}>
                        {m.role}
                      </span>
                    )}
                    {isOwnerOrAdmin && m.role !== 'OWNER' && (
                      <button onClick={() => setRemoveMemberId(m.user.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10 opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </AnimatedCard>
        </TabsContent>

        <TabsContent value="projects">
          <AnimatedCard delay={0.1}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center">
                <FolderKanban className="w-5 h-5 mr-2 text-gray-400" />
                Projects ({org.projects?.length || 0})
              </h2>
            </div>
            {org.projects?.length === 0 ? (
              <div className="text-center py-12 text-gray-500 border border-dashed border-white/10 rounded-xl">
                No projects in this organization yet. Create one from the Projects page.
              </div>
            ) : (
              <div className="space-y-3">
                {org.projects?.map((p: any) => (
                  <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center justify-between p-4 bg-black border border-white/5 rounded-xl hover:border-white/20 transition-all group">
                    <div className="flex items-center space-x-4">
                      <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                        <FolderKanban className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-400 transition-all">{p.name}</p>
                        <p className="text-xs text-gray-500">{p._count?.services || 0} services</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                  </Link>
                ))}
              </div>
            )}
          </AnimatedCard>
        </TabsContent>
      </Tabs>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <h2 className="text-2xl font-bold text-white mb-6 tracking-tight flex items-center"><UserPlus className="w-6 h-6 mr-3" />Invite Member</h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
                  <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none" autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Role</label>
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/30 transition-all outline-none">
                    {org.currentUserRole === 'OWNER' && <option value="ADMIN">Admin</option>}
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-6 border-t border-white/10 mt-8">
                <button onClick={() => { setShowInviteModal(false); setInviteEmail(''); }} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors font-medium rounded-lg hover:bg-white/5">Cancel</button>
                <button onClick={() => inviteMutation.mutate()} disabled={!inviteEmail || inviteMutation.isPending} className="px-5 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 disabled:opacity-50 font-medium transition-all active:scale-95">
                  {inviteMutation.isPending ? 'Inviting...' : 'Invite'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Remove Member Confirm */}
      <AlertDialog open={!!removeMemberId} onOpenChange={(open) => !open && setRemoveMemberId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to remove this member from the organization?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (removeMemberId) removeMemberMutation.mutate(removeMemberId); }} disabled={removeMemberMutation.isPending}>
              {removeMemberMutation.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}
