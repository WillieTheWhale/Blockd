import { cn } from '@/lib/utils'

// Import official Blockd logos at different sizes
import logo16 from '@/assets/logos/product_logo_16.png'
import logo24 from '@/assets/logos/product_logo_24.png'
import logo32 from '@/assets/logos/product_logo_32.png'
import logo48 from '@/assets/logos/product_logo_48.png'
import logo64 from '@/assets/logos/product_logo_64.png'
import logo128 from '@/assets/logos/product_logo_128.png'
import logo256 from '@/assets/logos/product_logo_256.png'

// Map sizes to appropriate logo files
const logoSrcMap = {
  xs: logo24,
  sm: logo32,
  md: logo48,
  lg: logo64,
  xl: logo128,
}

// Pixel sizes for each variant
const pixelSizeMap = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 40,
  xl: 48,
}

const textSizeMap = {
  xs: 'text-sm',
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
}

const gapMap = {
  xs: 'gap-1.5',
  sm: 'gap-2',
  md: 'gap-2.5',
  lg: 'gap-3',
  xl: 'gap-3',
}

interface LogoProps {
  /** Size variant for the logo */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Whether to show the text alongside the icon */
  showText?: boolean
  /** Additional CSS classes */
  className?: string
  /** Text color class */
  textClassName?: string
}

/**
 * Blockd Logo Component
 *
 * Uses the official Blockd PNG logo from the Chromium browser branding.
 *
 * @example
 * // Icon only (small)
 * <Logo size="sm" />
 *
 * // Icon with text (medium)
 * <Logo size="md" showText />
 */
export function Logo({
  size = 'md',
  showText = false,
  className,
  textClassName,
}: LogoProps) {
  const logoSrc = logoSrcMap[size]
  const pixelSize = pixelSizeMap[size]

  return (
    <div className={cn('flex items-center', gapMap[size], className)}>
      <img
        src={logoSrc}
        alt="Blockd"
        width={pixelSize}
        height={pixelSize}
        className="object-contain"
      />
      {showText && (
        <span className={cn('font-bold', textSizeMap[size], textClassName)}>
          Blockd
        </span>
      )}
    </div>
  )
}

interface LogoIconProps {
  /** Size in pixels */
  size?: number
  /** Additional CSS classes */
  className?: string
}

/**
 * Blockd Logo Icon
 *
 * The official Blockd logo as a PNG image.
 * Uses the appropriate resolution based on size.
 */
export function LogoIcon({ size = 32, className }: LogoIconProps) {
  // Select appropriate resolution based on size
  let logoSrc = logo32
  if (size <= 16) logoSrc = logo16
  else if (size <= 24) logoSrc = logo24
  else if (size <= 32) logoSrc = logo32
  else if (size <= 48) logoSrc = logo48
  else if (size <= 64) logoSrc = logo64
  else if (size <= 128) logoSrc = logo128
  else logoSrc = logo256

  return (
    <img
      src={logoSrc}
      alt="Blockd"
      width={size}
      height={size}
      className={cn('object-contain', className)}
    />
  )
}

interface LogoWithBackgroundProps extends LogoProps {
  /** Background style - note: PNG logo already has its own background */
  variant?: 'primary' | 'muted' | 'none'
}

/**
 * Logo with optional wrapper
 *
 * The official Blockd PNG logo. The 'variant' prop is kept for API compatibility
 * but the PNG logo already includes its own rounded background.
 */
export function LogoWithBackground({
  size = 'md',
  showText = false,
  className,
  textClassName,
}: LogoWithBackgroundProps) {
  const logoSrc = logoSrcMap[size]
  const pixelSize = pixelSizeMap[size]

  return (
    <div className={cn('flex items-center', gapMap[size], className)}>
      <img
        src={logoSrc}
        alt="Blockd"
        width={pixelSize}
        height={pixelSize}
        className="object-contain"
      />
      {showText && (
        <span className={cn('font-bold', textSizeMap[size], textClassName)}>
          Blockd
        </span>
      )}
    </div>
  )
}

/**
 * Large Logo Image
 *
 * For cases where you need a specific pixel size.
 */
interface LogoImageProps {
  /** Height in pixels */
  height?: number
  /** Additional CSS classes */
  className?: string
  /** Alt text */
  alt?: string
}

export function LogoImage({ height = 40, className, alt = 'Blockd' }: LogoImageProps) {
  // Select appropriate resolution
  let logoSrc = logo64
  if (height <= 24) logoSrc = logo24
  else if (height <= 32) logoSrc = logo32
  else if (height <= 48) logoSrc = logo48
  else if (height <= 64) logoSrc = logo64
  else if (height <= 128) logoSrc = logo128
  else logoSrc = logo256

  return (
    <img
      src={logoSrc}
      alt={alt}
      height={height}
      className={cn('object-contain', className)}
      style={{ height: `${height}px`, width: 'auto' }}
    />
  )
}

export default Logo
