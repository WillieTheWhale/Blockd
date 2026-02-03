import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/cn';

// Mini Heatmap Component
// Simplified gaze tracking visualization for hero section

interface MiniHeatmapProps {
  className?: string;
}

export function MiniHeatmap({ className }: MiniHeatmapProps) {
  const [gazePoint, setGazePoint] = useState({ x: 50, y: 50 });

  // Simulate gaze movement
  useEffect(() => {
    const interval = setInterval(() => {
      setGazePoint(prev => ({
        x: Math.max(20, Math.min(80, prev.x + (Math.random() - 0.5) * 20)),
        y: Math.max(20, Math.min(80, prev.y + (Math.random() - 0.5) * 15)),
      }));
    }, 800);

    return () => clearInterval(interval);
  }, []);

  // Generate heatmap grid
  const grid = useMemo(() => {
    const cells = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 12; x++) {
        const cellX = (x / 12) * 100;
        const cellY = (y / 8) * 100;
        const distance = Math.sqrt(
          Math.pow(cellX - gazePoint.x, 2) + Math.pow(cellY - gazePoint.y, 2)
        );
        const intensity = Math.max(0, 1 - distance / 50);
        cells.push({ x, y, intensity });
      }
    }
    return cells;
  }, [gazePoint]);

  return (
    <div className={cn('relative rounded-lg overflow-hidden', className)}>
      {/* Grid */}
      <div className="absolute inset-0 grid grid-cols-12 grid-rows-8 gap-px p-1">
        {grid.map((cell, i) => (
          <div
            key={i}
            className="transition-colors duration-300"
            style={{
              backgroundColor: cell.intensity > 0.1
                ? `rgba(74, 222, 128, ${cell.intensity * 0.6})`
                : 'rgba(104, 113, 147, 0.1)',
            }}
          />
        ))}
      </div>

      {/* Gaze point indicator */}
      <div
        className="absolute w-4 h-4 rounded-full border-2 border-blockd-risk-low transition-all duration-300"
        style={{
          left: `${gazePoint.x}%`,
          top: `${gazePoint.y}%`,
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 10px rgba(74, 222, 128, 0.5)',
        }}
      >
        <div className="absolute inset-1 rounded-full bg-blockd-risk-low/50" />
      </div>

      {/* Screen simulation overlay */}
      <div className="absolute inset-0 border border-white/10 rounded-lg pointer-events-none">
        {/* Browser chrome mockup */}
        <div className="absolute top-0 left-0 right-0 h-4 bg-blockd-surface/50 flex items-center gap-1 px-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blockd-risk-critical/60" />
          <div className="w-1.5 h-1.5 rounded-full bg-blockd-risk-medium/60" />
          <div className="w-1.5 h-1.5 rounded-full bg-blockd-risk-low/60" />
        </div>
      </div>
    </div>
  );
}
