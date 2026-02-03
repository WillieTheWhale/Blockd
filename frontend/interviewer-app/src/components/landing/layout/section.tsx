import { forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { cn } from '@/lib/cn';
import { sectionVariants } from '@/lib/animations';
import { Container } from './container';

// Section Component

interface SectionProps extends Omit<HTMLMotionProps<'section'>, 'children'> {
  id?: string;
  children: React.ReactNode;
  container?: boolean;
  containerSize?: 'default' | 'narrow' | 'wide';
  background?: 'void' | 'surface' | 'gradient' | 'none';
  padding?: 'default' | 'large' | 'small' | 'none';
  animate?: boolean;
}

const paddingStyles = {
  default: 'py-16 md:py-20 lg:py-32',
  large: 'py-24 md:py-32 lg:py-40',
  small: 'py-8 md:py-12 lg:py-16',
  none: '',
};

const backgroundStyles = {
  void: 'bg-blockd-void',
  surface: 'bg-blockd-surface/20',
  gradient: 'gradient-spotlight',
  none: '',
};

export const Section = forwardRef<HTMLElement, SectionProps>(
  (
    {
      id,
      children,
      container = true,
      containerSize = 'default',
      background = 'none',
      padding = 'default',
      animate = true,
      className,
      ...props
    },
    ref
  ) => {
    const { ref: inViewRef, inView } = useInView({
      threshold: 0.1,
      triggerOnce: true,
    });

    // Merge refs
    const setRefs = (node: HTMLElement | null) => {
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
      inViewRef(node);
    };

    const content = container ? (
      <Container size={containerSize}>{children}</Container>
    ) : (
      children
    );

    if (animate) {
      return (
        <motion.section
          ref={setRefs}
          id={id}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          variants={sectionVariants}
          className={cn(
            'relative',
            paddingStyles[padding],
            backgroundStyles[background],
            className
          )}
          {...props}
        >
          {content}
        </motion.section>
      );
    }

    return (
      <section
        ref={ref}
        id={id}
        className={cn(
          'relative',
          paddingStyles[padding],
          backgroundStyles[background],
          className
        )}
      >
        {content}
      </section>
    );
  }
);

Section.displayName = 'Section';

// Section Header Component

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  centered?: boolean;
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  centered = true,
  className,
}: SectionHeaderProps) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 30 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
        },
      }}
      className={cn(
        'mb-12 md:mb-16',
        centered && 'text-center',
        className
      )}
    >
      <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-blockd-light mb-4">
        {title}
      </h2>
      {subtitle && (
        <p className="text-lg md:text-xl text-blockd-muted max-w-3xl mx-auto leading-relaxed">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
