import { useEffect, useState } from 'react';

// Scroll Background Gradient
// Changes background color as user scrolls

export function ScrollBackgroundGradient() {
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

  // Subtle color shift from pure void to slightly warmer
  const opacity = Math.min(scrollProgress * 0.3, 0.15);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        background: `linear-gradient(180deg,
          rgba(1, 16, 27, 1) 0%,
          rgba(10, 25, 41, ${opacity}) 50%,
          rgba(1, 16, 27, 1) 100%
        )`,
      }}
    />
  );
}
