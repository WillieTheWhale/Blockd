import { cn } from '@/lib/cn';

// Live Indicator Component
// Pulsing indicator showing live session status

interface LiveIndicatorProps {
  className?: string;
}

export function LiveIndicator({ className }: LiveIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative">
        <div className="w-2 h-2 rounded-full bg-blockd-risk-low" />
        <div className="absolute inset-0 w-2 h-2 rounded-full bg-blockd-risk-low animate-ping opacity-75" />
      </div>
      <span className="text-xs font-mono uppercase tracking-wider text-blockd-risk-low">
        Live
      </span>
    </div>
  );
}
