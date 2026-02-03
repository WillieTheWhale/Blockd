import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { heroDashboard } from '@/lib/animations';
import { LiveIndicator } from './live-indicator';
import { MiniHeatmap } from './mini-heatmap';
import { MiniRiskGauge } from '@/components/landing/visualizations/risk-gauge';
import { EventFeed } from './event-feed';

// Hero Dashboard Preview Component

interface HeroDashboardProps {
  className?: string;
}

export function HeroDashboard({ className }: HeroDashboardProps) {
  const [riskScore, setRiskScore] = useState(0.18);
  const [currentTime, setCurrentTime] = useState('');

  // Update time every second
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(
        new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Slowly oscillate risk score
  useEffect(() => {
    const interval = setInterval(() => {
      setRiskScore((prev) => {
        const delta = (Math.random() - 0.5) * 0.03;
        return Math.max(0.12, Math.min(0.28, prev + delta));
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      variants={heroDashboard}
      initial="hidden"
      animate="visible"
      className={cn(
        'bg-blockd-surface border-2 border-white/30',
        'p-6 rounded-2xl',
        'shadow-[0_20px_60px_rgba(0,0,0,0.15)]',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <LiveIndicator />
        <span className="text-xs font-mono text-blockd-muted/60">
          Session: demo-001
        </span>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Mini Heatmap - Top spanning both columns */}
        <div className="col-span-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-blockd-muted mb-2">
            Gaze Tracking
          </div>
          <MiniHeatmap className="h-32 bg-blockd-void/50" />
        </div>

        {/* Risk Score */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-blockd-muted mb-2">
            Risk Score
          </div>
          <div className="bg-blockd-void/50 border border-white/10 p-3 rounded-lg">
            <div className="text-2xl font-mono font-medium text-blockd-light tabular-nums mb-1">
              {riskScore.toFixed(2)}
            </div>
            <MiniRiskGauge value={riskScore} />
            <div className="text-[10px] font-mono text-blockd-risk-minimal mt-1">
              MINIMAL
            </div>
          </div>
        </div>

        {/* Event Feed */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-blockd-muted mb-2">
            Security Events
          </div>
          <div className="bg-blockd-void/50 border border-white/10 p-2 rounded-lg h-[120px] overflow-hidden">
            <EventFeed />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-blockd-muted/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blockd-risk-low" />
            <span className="text-[10px] text-blockd-muted">Recording</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blockd-accent" />
            <span className="text-[10px] text-blockd-muted">Analyzing</span>
          </div>
        </div>
        <span className="text-xs font-mono text-blockd-muted/60 tabular-nums">
          {currentTime}
        </span>
      </div>
    </motion.div>
  );
}
