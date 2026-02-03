import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

// Brutalist Button Component
// Sharp edges, instant state changes, thick borders

interface LandingButtonProps {
  variant?: 'primary' | 'secondary' | 'text';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  href?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

const variantStyles = {
  primary: cn(
    'bg-white text-blockd-void',
    'border-2 border-white',
    'hover:bg-blockd-void hover:text-white',
    'active:bg-blockd-void active:text-white'
  ),
  secondary: cn(
    'bg-transparent text-white',
    'border-2 border-white',
    'hover:bg-white hover:text-blockd-void',
    'active:bg-white active:text-blockd-void'
  ),
  text: cn(
    'bg-transparent text-white',
    'border-2 border-transparent',
    'hover:border-white',
    'active:border-white'
  ),
};

const sizeStyles = {
  sm: 'px-5 py-2.5 text-sm',
  md: 'px-8 py-4 text-base',
  lg: 'px-10 py-5 text-lg',
};

export const LandingButton = forwardRef<HTMLButtonElement, LandingButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      children,
      href,
      icon,
      iconPosition = 'left',
      className,
      disabled,
      onClick,
      type = 'button',
    },
    ref
  ) => {
    const buttonClasses = cn(
      'inline-flex items-center justify-center gap-2',
      'font-bold uppercase tracking-wider',
      'transition-none',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blockd-void',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      variantStyles[variant],
      sizeStyles[size],
      className
    );

    const content = (
      <>
        {icon && iconPosition === 'left' && (
          <span className="w-5 h-5 flex items-center justify-center">
            {icon}
          </span>
        )}
        <span>{children}</span>
        {icon && iconPosition === 'right' && (
          <span className="w-5 h-5 flex items-center justify-center">
            {icon}
          </span>
        )}
      </>
    );

    if (href) {
      return (
        <a
          href={href}
          className={buttonClasses}
          onClick={onClick}
        >
          {content}
        </a>
      );
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        onClick={onClick}
        className={buttonClasses}
      >
        {content}
      </button>
    );
  }
);

LandingButton.displayName = 'LandingButton';
