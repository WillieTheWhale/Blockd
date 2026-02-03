import { useRef } from 'react';
import { motion, useInView, Variants } from 'framer-motion';

// Section Wrapper - Cinematic entrance animations for page sections

type TransitionType = 'fadeUp' | 'fadeIn' | 'blur' | 'reveal' | 'wipe' | 'scale';

interface SectionWrapperProps {
  children: React.ReactNode;
  className?: string;
  transition?: TransitionType;
  delay?: number;
  duration?: number;
  once?: boolean;
  threshold?: number;
}

const transitionVariants: Record<TransitionType, Variants> = {
  fadeUp: {
    hidden: { opacity: 0, y: 60 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  },
  fadeIn: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  },
  blur: {
    hidden: {
      opacity: 0,
      filter: 'blur(20px)',
      scale: 0.95,
    },
    visible: {
      opacity: 1,
      filter: 'blur(0px)',
      scale: 1,
      transition: {
        duration: 0.7,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  },
  reveal: {
    hidden: {
      clipPath: 'inset(100% 0 0 0)',
      opacity: 0,
    },
    visible: {
      clipPath: 'inset(0 0 0 0)',
      opacity: 1,
      transition: {
        duration: 0.8,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  },
  wipe: {
    hidden: {
      clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)',
    },
    visible: {
      clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
      transition: {
        duration: 1,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  },
  scale: {
    hidden: {
      opacity: 0,
      scale: 0.9,
    },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.6,
        ease: [0.34, 1.56, 0.64, 1], // Spring overshoot
      },
    },
  },
};

export function SectionWrapper({
  children,
  className,
  transition = 'fadeUp',
  delay = 0,
  duration,
  once = true,
  threshold = 0.1,
}: SectionWrapperProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, amount: threshold });

  const variants = transitionVariants[transition];

  // Get transition from visible variant if it exists
  const visibleVariant = variants['visible'];
  const baseTransition = visibleVariant && typeof visibleVariant === 'object' && 'transition' in visibleVariant
    ? (visibleVariant['transition'] as Record<string, unknown>)
    : {};

  // Override duration if provided
  const customVariants: Variants = {
    hidden: variants['hidden'] ?? { opacity: 0 },
    visible: {
      ...(typeof visibleVariant === 'object' ? visibleVariant : { opacity: 1 }),
      transition: {
        ...baseTransition,
        ...(duration !== undefined ? { duration } : {}),
        delay,
      },
    },
  };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={customVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Stagger Container - Animates children with staggered delays

interface StaggerContainerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
  delayChildren?: number;
  once?: boolean;
  threshold?: number;
}

export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.1,
  delayChildren = 0,
  once = true,
  threshold = 0.1,
}: StaggerContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, amount: threshold });

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren,
      },
    },
  };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={containerVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Stagger Item - Child component for StaggerContainer

interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
}

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

export function StaggerItem({ children, className }: StaggerItemProps) {
  return (
    <motion.div variants={staggerItemVariants} className={className}>
      {children}
    </motion.div>
  );
}
