import { memo } from 'react';
import { cn } from '@/lib/cn';

// Grid Pattern Background Effect
// Performance: Memoized to prevent unnecessary re-renders

interface GridPatternProps {
  className?: string;
}

export const GridPattern = memo(function GridPattern({ className }: GridPatternProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 grid-pattern pointer-events-none',
        className
      )}
      aria-hidden="true"
    />
  );
});

// Animated Grid (with subtle movement)
// Performance: Memoized to prevent unnecessary re-renders

export const AnimatedGrid = memo(function AnimatedGrid({ className }: GridPatternProps) {
  return (
    <div
      className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)}
      aria-hidden="true"
    >
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="animated-grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(104, 113, 147, 0.12)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#animated-grid)" />
      </svg>
    </div>
  );
});
