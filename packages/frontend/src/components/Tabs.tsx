import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = ({ className, ...props }: TabsPrimitive.TabsListProps) => (
  <TabsPrimitive.List
    className={cn(
      "flex items-center space-x-2 border-b border-white/10 mb-6",
      className
    )}
    {...props}
  />
);

export const TabsTrigger = ({ className, value, children, ...props }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger
    value={value}
    className={cn(
      "relative px-4 py-2.5 text-sm font-medium transition-colors outline-none",
      "text-gray-400 hover:text-gray-200",
      "data-[state=active]:text-white",
      className
    )}
    {...props}
  >
    {children}
    <TabsPrimitive.Trigger value={value} asChild>
      {/* We use a sibling to render the active indicator */}
      {/* Actually, Radix doesn't support asChild like this easily for an internal div, we can just use CSS for the active border */}
    </TabsPrimitive.Trigger>
    <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-white opacity-0 transition-opacity radix-state-active:opacity-100 shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
  </TabsPrimitive.Trigger>
);

export const TabsContent = ({ className, ...props }: TabsPrimitive.TabsContentProps) => (
  <TabsPrimitive.Content
    className={cn(
      "mt-4 outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-lg",
      className
    )}
    {...props}
  />
);
