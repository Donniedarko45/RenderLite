import { useEffect, useState, useMemo } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  FolderKanban,
  LayoutDashboard,
  Building2,
  Server,
  Rocket,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  projectsApi,
  servicesApi,
  deploymentsApi,
  organizationsApi,
} from '../api/client';

const MAX_RESULTS_PER_GROUP = 8;

/** Normalize and match query: supports multi-word (all must match), case-insensitive.
 * Also matches when query has no spaces: "myorg" matches "My Organization" */
function matchSearch(text: string | undefined, query: string): boolean {
  if (!text || !query.trim()) return true;
  const n = text.toLowerCase();
  const nCompact = n.replace(/\s+/g, ''); // "my organization" -> "myorganization"
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return terms.every((term) => n.includes(term) || nCompact.includes(term));
}

/** cmdk filter: return 1 if match, 0 otherwise */
function cmdkFilter(value: string, search: string): number {
  if (!search.trim()) return 1;
  return matchSearch(value, search) ? 1 : 0;
}

/** Build searchable value for deployments (service name + commit) */
function deploymentSearchValue(d: { service?: { name?: string }; commitSha?: string }): string {
  const name = d.service?.name ?? '';
  const sha = d.commitSha?.substring(0, 7) ?? '';
  return `${name} ${sha}`.trim();
}

const itemClass =
  'flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer transition-colors aria-selected:bg-white/10 aria-selected:text-white data-[selected=true]:bg-white/10 data-[selected=true]:text-white';
const groupHeadingClass =
  'text-[11px] font-semibold text-gray-500 px-3 py-2 uppercase tracking-wider flex items-center gap-2';

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  // Fetch data when menu is open (cached by React Query)
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then((r) => r.data),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => servicesApi.list().then((r) => r.data),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const { data: deployments = [], isLoading: deploymentsLoading } = useQuery({
    queryKey: ['recent-deployments-search'],
    queryFn: () => deploymentsApi.list().then((r) => r.data.slice(0, 20)),
    enabled: open,
    staleTime: 30 * 1000,
  });

  const { data: organizations = [], isLoading: orgsLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizationsApi.list().then((r) => r.data),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const isLoading = projectsLoading || servicesLoading || deploymentsLoading || orgsLoading;
  const q = search.trim();

  // Filter and limit results per group
  const filtered = useMemo(() => {
    const limit = MAX_RESULTS_PER_GROUP;
    return {
      projects: projects.filter((p: { name?: string }) => matchSearch(p.name, q)).slice(0, limit),
      services: services.filter((s: { name?: string }) => matchSearch(s.name, q)).slice(0, limit),
      deployments: deployments
        .filter((d: { service?: { name?: string }; commitSha?: string }) =>
          matchSearch(deploymentSearchValue(d), q)
        )
        .slice(0, limit),
      organizations: organizations.filter((o: { name?: string; slug?: string }) =>
        matchSearch([o.name, o.slug].filter(Boolean).join(' '), q)
      ).slice(0, limit),
    };
  }, [projects, services, deployments, organizations, q]);

  const navMatches = useMemo(() => ({
    dashboard: matchSearch('Dashboard', q),
    projects: matchSearch('Projects', q),
    organizations: matchSearch('Organizations', q),
  }), [q]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
        if (!open) setSearch('');
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden lg:flex items-center text-sm text-gray-400 bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all group"
        aria-label="Open search (⌘K)"
      >
        <Search className="w-4 h-4 mr-2 text-gray-500 group-hover:text-white transition-colors shrink-0" />
        <span className="mr-4">Search projects, services...</span>
        <kbd className="font-sans font-semibold bg-black px-1.5 py-0.5 rounded border border-white/10 text-[10px] shrink-0">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl bg-[#0d0d0d] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            >
             <Command
  shouldFilter
  filter={cmdkFilter}
  className="cmdk"
  loop
>
                <div className="flex items-center border-b border-white/10 px-4 gap-3">
                  <Search className="w-5 h-5 text-gray-500 shrink-0" />
                  <Command.Input
                    value={search}
                    onValueChange={setSearch}
                    placeholder="Search projects, services, deployments, or organizations..."
                    className="flex-1 min-w-0 bg-transparent text-white py-4 outline-none placeholder:text-gray-500 font-sans text-base"
                    autoFocus
                    aria-label="Search"
                  />
                  <kbd className="hidden sm:inline-flex font-sans font-medium text-gray-500 bg-black/80 px-2 py-1 rounded border border-white/10 text-[10px]">
                    ESC
                  </kbd>
                </div>

                <Command.List
                  className="max-h-[min(60vh,400px)] overflow-y-auto p-2"
                  aria-label="Search results"
                >
                  {isLoading && (
                    <div className="flex items-center justify-center gap-2 py-8 text-gray-500" role="status" aria-live="polite">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">Loading...</span>
                    </div>
                  )}

                  {!isLoading && (
                    <>
                      {/* Navigation — show when query is empty or matches */}
                      {(navMatches.dashboard || navMatches.projects || navMatches.organizations) && (
                        <Command.Group heading="Navigation" className={groupHeadingClass}>
                          {navMatches.dashboard && (
                            <Command.Item
                              value="Dashboard"
                              onSelect={() => run(() => navigate('/'))}
                              className={itemClass}
                            >
                              <LayoutDashboard className="w-4 h-4 shrink-0 text-gray-500" />
                              <span>Dashboard</span>
                            </Command.Item>
                          )}
                          {navMatches.projects && (
                            <Command.Item
                              value="Projects"
                              onSelect={() => run(() => navigate('/projects'))}
                              className={itemClass}
                            >
                              <FolderKanban className="w-4 h-4 shrink-0 text-gray-500" />
                              <span>Projects</span>
                            </Command.Item>
                          )}
                          {navMatches.organizations && (
                            <Command.Item
                              value="Organizations"
                              onSelect={() => run(() => navigate('/organizations'))}
                              className={itemClass}
                            >
                              <Building2 className="w-4 h-4 shrink-0 text-gray-500" />
                              <span>Organizations</span>
                            </Command.Item>
                          )}
                        </Command.Group>
                      )}

                      {filtered.projects.length > 0 && (
                        <Command.Group heading="Projects" className={groupHeadingClass}>
                          {filtered.projects.map((p: { id: string; name: string }) => (
                            <Command.Item
                              key={p.id}
                              value={`project ${p.name} ${p.id}`}
                              onSelect={() => run(() => navigate(`/projects/${p.id}`))}
                              className={itemClass}
                            >
                              <FolderKanban className="w-4 h-4 shrink-0 text-violet-400" />
                              <span className="truncate">{p.name}</span>
                              <ArrowRight className="w-3.5 h-3.5 ml-auto shrink-0 text-gray-600" />
                            </Command.Item>
                          ))}
                        </Command.Group>
                      )}

                      {filtered.services.length > 0 && (
                        <Command.Group heading="Services" className={groupHeadingClass}>
                          {filtered.services.map((s: { id: string; name: string }) => (
                            <Command.Item
                              key={s.id}
                              value={`service ${s.name} ${s.id}`}
                              onSelect={() => run(() => navigate(`/services/${s.id}`))}
                              className={itemClass}
                            >
                              <Server className="w-4 h-4 shrink-0 text-emerald-400" />
                              <span className="truncate">{s.name}</span>
                              <ArrowRight className="w-3.5 h-3.5 ml-auto shrink-0 text-gray-600" />
                            </Command.Item>
                          ))}
                        </Command.Group>
                      )}

                      {filtered.deployments.length > 0 && (
                        <Command.Group heading="Deployments" className={groupHeadingClass}>
                          {filtered.deployments.map((d: { id: string; service?: { name: string }; commitSha?: string; status?: string }) => (
                            <Command.Item
                              key={d.id}
                              value={`deployment ${d.service?.name ?? ''} ${d.commitSha ?? ''} ${d.id}`}
                              onSelect={() => run(() => navigate(`/deployments/${d.id}`))}
                              className={itemClass}
                            >
                              <Rocket className="w-4 h-4 shrink-0 text-amber-400" />
                              <div className="flex-1 min-w-0">
                                <span className="truncate block">{d.service?.name ?? 'Deployment'}</span>
                                <span className="text-xs text-gray-500 font-mono">
                                  {d.commitSha?.substring(0, 7) ?? '—'}
                                </span>
                              </div>
                              <ArrowRight className="w-3.5 h-3.5 shrink-0 text-gray-600" />
                            </Command.Item>
                          ))}
                        </Command.Group>
                      )}

                      {filtered.organizations.length > 0 && (
                        <Command.Group heading="Organizations" className={groupHeadingClass}>
                          {filtered.organizations.map((o: { id: string; name: string; slug?: string }) => (
                            <Command.Item
                              key={o.id}
                              value={`org ${o.name} ${o.slug ?? ''} ${o.id}`}
                              onSelect={() => run(() => navigate(`/organizations/${o.id}`))}
                              className={itemClass}
                            >
                              <Building2 className="w-4 h-4 shrink-0 text-blue-400" />
                              <span className="truncate">{o.name}</span>
                              <ArrowRight className="w-3.5 h-3.5 ml-auto shrink-0 text-gray-600" />
                            </Command.Item>
                          ))}
                        </Command.Group>
                      )}

                      <Command.Empty
                        className="py-8 text-center text-sm text-gray-500 px-4"
                        role="status"
                      >
                        {q
                          ? `No results for "${q}". Try a different name or keyword.`
                          : 'No projects, services, or organizations yet. Create one to get started.'}
                      </Command.Empty>
                    </>
                  )}
                </Command.List>

                <div
                  className="flex items-center justify-center gap-4 px-4 py-2.5 border-t border-white/5 text-[11px] text-gray-500"
                  aria-hidden="true"
                >
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono">↑</kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono">↓</kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono">↵</kbd>
                    Select
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono">ESC</kbd>
                    Close
                  </span>
                </div>
              </Command>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
