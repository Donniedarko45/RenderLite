import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  size?: 'sm' | 'md' | 'lg';
}

export function Spinner({ size = 'md', className, ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <Loader2 
      className={cn(
        "animate-spin text-gray-400", 
        sizeClasses[size], 
        className
      )} 
      {...props} 
    />
  );
}