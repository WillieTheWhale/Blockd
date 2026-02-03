import { useRef, useState, useEffect } from 'react';
import { useInView } from 'react-intersection-observer';

interface UseCountupOptions {
  end: number;
  start?: number;
  duration?: number;
  decimals?: number;
}

export function useCountup({ end, start = 0, duration = 2000, decimals = 0 }: UseCountupOptions) {
  const [count, setCount] = useState(start);
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (inView && !hasAnimated.current) {
      hasAnimated.current = true;
      const startTime = Date.now();
      const endTime = startTime + duration;

      const tick = () => {
        const now = Date.now();
        const progress = Math.min((now - startTime) / duration, 1);
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const currentValue = start + (end - start) * easeOutQuart;

        setCount(Number(currentValue.toFixed(decimals)));

        if (now < endTime) {
          requestAnimationFrame(tick);
        }
      };

      requestAnimationFrame(tick);
    }
  }, [inView, start, end, duration, decimals]);

  return { ref, count };
}
