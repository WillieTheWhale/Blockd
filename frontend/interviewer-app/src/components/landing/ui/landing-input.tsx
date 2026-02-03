import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

// Text Input Component

interface LandingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const LandingInput = forwardRef<HTMLInputElement, LandingInputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-blockd-muted mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full px-4 py-3',
            'bg-blockd-surface/40 rounded-lg',
            'border border-blockd-muted/20',
            'text-blockd-light placeholder:text-blockd-muted/50',
            'transition-all duration-200',
            'focus:outline-none focus:border-blockd-accent focus:shadow-[inset_0_0_20px_rgba(104,113,147,0.15)]',
            error && 'border-blockd-risk-critical',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-2 text-sm text-blockd-risk-critical">{error}</p>
        )}
      </div>
    );
  }
);

LandingInput.displayName = 'LandingInput';
