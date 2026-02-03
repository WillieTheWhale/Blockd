import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

// Mini Risk Gauge Component
// Small horizontal gauge showing risk level

interface MiniRiskGaugeProps {
  value: number; // 0-1
  className?: string;
}

export function MiniRiskGauge({ value, className }: MiniRiskGaugeProps) {
  // Determine color based on risk level
  const getColor = (v: number) => {
    if (v < 0.25) return 'bg-blockd-risk-minimal';
    if (v < 0.5) return 'bg-blockd-risk-low';
    if (v < 0.7) return 'bg-blockd-risk-medium';
    if (v < 0.85) return 'bg-blockd-risk-high';
    return 'bg-blockd-risk-critical';
  };

  return (
    <div className={cn('h-1.5 bg-blockd-void/50 rounded-full overflow-hidden', className)}>
      <motion.div
        className={cn('h-full rounded-full', getColor(value))}
        initial={{ width: 0 }}
        animate={{ width: `${value * 100}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  );
}

// Detection Comparison Chart
// Horizontal bar chart comparing detection rates

interface DetectionData {
  label: string;
  traditional: number;
  blockd: number;
}

interface DetectionComparisonChartProps {
  data: DetectionData[];
  className?: string;
}

export function DetectionComparisonChart({ data, className }: DetectionComparisonChartProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {data.map((item, index) => (
        <div key={item.label} className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-blockd-light font-medium">{item.label}</span>
          </div>

          {/* Traditional bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-blockd-muted">Traditional</span>
              <span className="text-blockd-muted font-mono">{item.traditional}%</span>
            </div>
            <div className="h-2 bg-blockd-void/50 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blockd-muted/50 rounded-full"
                initial={{ width: 0 }}
                whileInView={{ width: `${item.traditional}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: index * 0.1, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Blockd bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-blockd-accent">Blockd</span>
              <span className="text-blockd-accent font-mono">{item.blockd}%</span>
            </div>
            <div className="h-2 bg-blockd-void/50 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blockd-risk-low rounded-full"
                initial={{ width: 0 }}
                whileInView={{ width: `${item.blockd}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: index * 0.1 + 0.2, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
