import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Event Feed Component
// Live security event stream for hero dashboard

interface SecurityEvent {
  id: number;
  type: 'gaze' | 'ai' | 'security';
  message: string;
  severity: 'minimal' | 'low' | 'medium' | 'high';
  timestamp: string;
}

const severityColors = {
  minimal: 'text-blockd-risk-minimal',
  low: 'text-blockd-risk-low',
  medium: 'text-blockd-risk-medium',
  high: 'text-blockd-risk-high',
};

const eventTemplates: Omit<SecurityEvent, 'id' | 'timestamp'>[] = [
  { type: 'gaze', message: 'Gaze on target', severity: 'low' },
  { type: 'gaze', message: 'Brief off-screen glance', severity: 'minimal' },
  { type: 'ai', message: 'Response analyzed', severity: 'low' },
  { type: 'security', message: 'Focus maintained', severity: 'low' },
  { type: 'ai', message: 'Natural typing pattern', severity: 'low' },
  { type: 'gaze', message: 'Reading question', severity: 'low' },
];

export function EventFeed() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);

  useEffect(() => {
    const getTimestamp = () =>
      new Date().toLocaleTimeString('en-US', { hour12: false });

    // Initialize with a few events
    const initial: SecurityEvent[] = [
      {
        id: 1,
        type: 'gaze',
        message: 'Gaze on target',
        severity: 'low',
        timestamp: getTimestamp(),
      },
      {
        id: 2,
        type: 'ai',
        message: 'Response analyzed',
        severity: 'low',
        timestamp: getTimestamp(),
      },
    ];
    setEvents(initial);

    // Add new events periodically
    let eventId = 3;
    const interval = setInterval(() => {
      const index = Math.floor(Math.random() * eventTemplates.length);
      const template = eventTemplates[index]!;
      const newEvent: SecurityEvent = {
        id: eventId++,
        type: template.type,
        message: template.message,
        severity: template.severity,
        timestamp: getTimestamp(),
      };

      setEvents(prev => [newEvent, ...prev.slice(0, 3)]);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-1.5 text-[10px] font-mono">
      <AnimatePresence mode="popLayout">
        {events.map((event) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2"
          >
            <span className="text-blockd-muted/60">{event.timestamp}</span>
            <span className={severityColors[event.severity]}>{event.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
