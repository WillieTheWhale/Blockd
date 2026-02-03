import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

// Cursor Glow Effect
// Subtle glow that follows the cursor

export function CursorGlow() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };

    const handleMouseEnter = () => setIsVisible(true);
    const handleMouseLeave = () => setIsVisible(false);

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseenter', handleMouseEnter);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseenter', handleMouseEnter);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [prefersReducedMotion]);

  if (prefersReducedMotion) return null;

  return (
    <motion.div
      className="fixed pointer-events-none z-[9998]"
      animate={{
        x: position.x - 150,
        y: position.y - 150,
        opacity: isVisible ? 0.15 : 0,
      }}
      transition={{
        type: 'spring',
        damping: 30,
        stiffness: 200,
        opacity: { duration: 0.2 },
      }}
      style={{
        width: 300,
        height: 300,
        background: 'radial-gradient(circle, rgba(104, 113, 147, 0.3) 0%, transparent 70%)',
        borderRadius: '50%',
      }}
    />
  );
}
