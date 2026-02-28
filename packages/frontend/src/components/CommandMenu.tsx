import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { Search, FolderKanban, LayoutDashboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center text-sm text-gray-400 bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all absolute top-6 right-10 z-50 group"
      >
        <Search className="w-4 h-4 mr-2 text-gray-500 group-hover:text-white transition-colors" />
        <span className="mr-4">Search...</span>
        <kbd className="font-sans font-semibold bg-black px-1.5 py-0.5 rounded border border-white/10 text-[10px]">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            >
              <Command className="w-full h-full">
                <div className="flex items-center border-b border-white/10 px-4">
                  <Search className="w-5 h-5 text-gray-500" />
                  <Command.Input 
                    placeholder="Type a command or search..." 
                    className="w-full bg-transparent text-white px-4 py-4 outline-none placeholder:text-gray-500 font-sans text-lg"
                    autoFocus
                  />
                  <kbd className="hidden sm:inline-block font-sans font-semibold text-gray-500 bg-black px-2 py-1 rounded border border-white/10 text-[10px]">
                    ESC
                  </kbd>
                </div>

                <Command.List className="max-h-[300px] overflow-y-auto p-2 custom-scrollbar">
                  <Command.Empty className="py-6 text-center text-sm text-gray-500">
                    No results found.
                  </Command.Empty>

                  <Command.Group heading="Navigation" className="text-xs font-semibold text-gray-500 px-2 py-2 uppercase tracking-wider">
                    <Command.Item 
                      onSelect={() => runCommand(() => navigate('/'))}
                      className="flex items-center px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer transition-colors aria-selected:bg-white/10 aria-selected:text-white"
                    >
                      <LayoutDashboard className="w-4 h-4 mr-3" />
                      Dashboard
                    </Command.Item>
                    <Command.Item 
                      onSelect={() => runCommand(() => navigate('/projects'))}
                      className="flex items-center px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer transition-colors aria-selected:bg-white/10 aria-selected:text-white"
                    >
                      <FolderKanban className="w-4 h-4 mr-3" />
                      Projects
                    </Command.Item>
                  </Command.Group>
                </Command.List>
              </Command>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
