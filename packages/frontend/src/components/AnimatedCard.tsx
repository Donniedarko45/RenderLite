import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '../lib/utils';
import React from 'react';

interface AnimatedCardProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function AnimatedCard({ children, className, delay = 0, ...props }: AnimatedCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.3, 
        delay,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={cn(
        "relative bg-[#0a0a0a] rounded-xl border border-white/10 p-6 overflow-hidden",
        "hover:border-white/20 transition-colors duration-200",
        className
      )}
      {...props}
    >
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
}
