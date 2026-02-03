import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

// Container Component

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  size?: 'default' | 'narrow' | 'wide';
}

const containerSizes = {
  default: 'max-w-[1440px]',
  narrow: 'max-w-4xl',
  wide: 'max-w-[1600px]',
};

export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  ({ children, size = 'default', className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'w-full mx-auto',
          'px-5 md:px-10 lg:px-20',
          containerSizes[size],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Container.displayName = 'Container';
