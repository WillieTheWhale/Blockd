import { useEffect, useState } from 'react';
import { motion, useSpring } from 'framer-motion';

// Scroll Progress Indicator
// Shows reading progress at the top of the page

export function ScrollProgress() {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = totalHeight > 0 ? window.scrollY / totalHeight : 0;
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scaleX = useSpring(scrollProgress, { stiffness: 100, damping: 30 });

  return (
    <div className="fixed top-0 left-0 right-0 h-1 z-[9999] bg-blockd-void">
      <motion.div
        className="h-full bg-blockd-light origin-left"
        style={{ scaleX }}
      />
    </div>
  );
}
