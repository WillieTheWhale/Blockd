import { cn } from '@/lib/utils'

interface LogoProps {
  /** Size variant for the logo */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Whether to show the text alongside the icon */
  showText?: boolean
  /** Additional CSS classes */
  className?: string
  /** Icon color class (defaults to current text color) */
  iconClassName?: string
  /** Text color class (defaults to current text color) */
  textClassName?: string
}

const sizeConfig = {
  xs: { icon: 'h-5 w-5', text: 'text-sm', gap: 'gap-1.5' },
  sm: { icon: 'h-6 w-6', text: 'text-base', gap: 'gap-2' },
  md: { icon: 'h-8 w-8', text: 'text-xl', gap: 'gap-2.5' },
  lg: { icon: 'h-10 w-10', text: 'text-2xl', gap: 'gap-3' },
  xl: { icon: 'h-12 w-12', text: 'text-3xl', gap: 'gap-3' },
}

/**
 * Blockd Logo Component
 *
 * A reusable logo component featuring the stylized "B" with keyhole icon
 * and optional "Blockd" text.
 *
 * @example
 * // Icon only (small)
 * <Logo size="sm" />
 *
 * // Icon with text (medium)
 * <Logo size="md" showText />
 *
 * // Custom colors
 * <Logo size="lg" showText iconClassName="text-primary" textClassName="text-foreground" />
 */
export function Logo({
  size = 'md',
  showText = false,
  className,
  iconClassName,
  textClassName,
}: LogoProps) {
  const config = sizeConfig[size]

  return (
    <div className={cn('flex items-center', config.gap, className)}>
      <LogoIcon className={cn(config.icon, iconClassName)} />
      {showText && (
        <span className={cn('font-bold', config.text, textClassName)}>
          Blockd
        </span>
      )}
    </div>
  )
}

interface LogoIconProps {
  className?: string
}

/**
 * Blockd Logo Icon
 *
 * The standalone "B" with keyhole icon SVG.
 * Uses currentColor so it inherits text color from parent.
 */
export function LogoIcon({ className }: LogoIconProps) {
  return (
    <svg
      viewBox="0 0 64 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Blockd logo"
    >
      {/* Stylized B shape */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 0 L0 80 L40 80 C55 80 64 70 64 56 C64 47 59 40 52 36 C58 32 62 25 62 17 C62 7 53 0 40 0 L0 0 Z
        M14 14 L38 14 C45 14 48 18 48 24 C48 30 45 34 38 34 L14 34 L14 14 Z
        M14 48 L38 48 C48 48 50 53 50 60 C50 67 48 72 38 72 L14 72 L14 48 Z"
        fill="currentColor"
      />
      {/* Keyhole */}
      <ellipse cx="32" cy="52" rx="7" ry="8" className="fill-white" />
      <path d="M28 52 L28 68 L36 68 L36 52 Z" className="fill-white" />
    </svg>
  )
}

interface LogoWithBackgroundProps extends LogoProps {
  /** Background style */
  variant?: 'primary' | 'muted' | 'none'
}

/**
 * Logo with background wrapper
 *
 * The logo icon wrapped in a rounded background container,
 * matching the existing UI pattern used in layouts.
 */
export function LogoWithBackground({
  size = 'md',
  showText = false,
  variant = 'primary',
  className,
  textClassName,
}: LogoWithBackgroundProps) {
  const config = sizeConfig[size]

  const bgSizeMap = {
    xs: 'h-6 w-6',
    sm: 'h-7 w-7',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
    xl: 'h-12 w-12',
  }

  const iconSizeMap = {
    xs: 'h-3.5 w-3.5',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
    xl: 'h-7 w-7',
  }

  const bgVariants = {
    primary: 'bg-primary',
    muted: 'bg-muted',
    none: '',
  }

  const iconVariants = {
    primary: 'text-primary-foreground',
    muted: 'text-foreground',
    none: 'text-current',
  }

  return (
    <div className={cn('flex items-center', config.gap, className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-lg',
          bgSizeMap[size],
          bgVariants[variant]
        )}
      >
        <LogoIcon className={cn(iconSizeMap[size], iconVariants[variant])} />
      </div>
      {showText && (
        <span className={cn('font-bold', config.text, textClassName)}>
          Blockd
        </span>
      )}
    </div>
  )
}

export default Logo
