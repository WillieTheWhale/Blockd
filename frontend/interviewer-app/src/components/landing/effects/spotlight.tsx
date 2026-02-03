import { useRef, useEffect, useState, memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

// Spotlight Effect - Mouse-following spotlight
// Performance: Optimized state updates

interface SpotlightProps {
  className?: string;
  size?: number;
}

export function Spotlight({ className, size = 600 }: SpotlightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  // Performance: Track visibility to avoid redundant state updates
  const isVisibleRef = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      setPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    const handleMouseEnter = () => {
      // Performance: Only update state if visibility changed
      if (!isVisibleRef.current) {
        isVisibleRef.current = true;
        setIsVisible(true);
      }
    };

    const handleMouseLeave = () => {
      // Performance: Only update state if visibility changed
      if (isVisibleRef.current) {
        isVisibleRef.current = false;
        setIsVisible(false);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove, { passive: true });
      container.addEventListener('mouseenter', handleMouseEnter);
      container.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseenter', handleMouseEnter);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)}
      aria-hidden="true"
    >
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size,
          height: size,
          left: position.x - size / 2,
          top: position.y - size / 2,
          background: `radial-gradient(circle at center, rgba(104, 113, 147, 0.12) 0%, transparent 70%)`,
        }}
        animate={{
          opacity: isVisible ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
}

// Static Spotlight - Fixed position glow
// Performance: Memoized to prevent unnecessary re-renders

interface StaticSpotlightProps {
  position?: 'center' | 'top-right' | 'bottom-left';
  color?: string;
  size?: number;
  className?: string;
}

const positionStylesMap = {
  center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  'top-right': 'top-0 right-0 translate-x-1/4 -translate-y-1/4',
  'bottom-left': 'bottom-0 left-0 -translate-x-1/4 translate-y-1/4',
} as const;

export const StaticSpotlight = memo(function StaticSpotlight({
  position = 'center',
  color = 'rgba(104, 113, 147, 0.1)',
  size = 800,
  className,
}: StaticSpotlightProps) {
  // Performance: Memoize style object to prevent unnecessary recalculations
  const style = useMemo(() => ({
    width: size,
    height: size,
    background: `radial-gradient(circle at center, ${color} 0%, transparent 70%)`,
  }), [size, color]);

  return (
    <div
      className={cn(
        'absolute rounded-full pointer-events-none',
        positionStylesMap[position],
        className
      )}
      style={style}
      aria-hidden="true"
    />
  );
});
