import { motion } from 'framer-motion';
import { Eye, Brain, Shield, FileText, Activity, Lock } from 'lucide-react';
import { Section, SectionHeader } from '@/components/landing/layout/section';
import { StaggerContainer, StaggerItem } from '@/components/landing/ui/section-wrapper';

// Features Section

const features = [
  {
    icon: Eye,
    title: 'Gaze Tracking',
    description: 'Native-level eye tracking using MediaPipe, detecting off-screen glances and reading patterns with millisecond precision.',
  },
  {
    icon: Brain,
    title: 'AI Detection',
    description: 'Multi-LLM analysis comparing responses against GPT-4, Claude, and Gemini to identify AI-generated content.',
  },
  {
    icon: Shield,
    title: 'Security Monitoring',
    description: 'Deep system-level monitoring for VMs, screen recording, second monitors, and suspicious processes.',
  },
  {
    icon: FileText,
    title: 'Evidence Reports',
    description: 'Comprehensive PDF reports with timestamped evidence, gaze heatmaps, and AI similarity scores.',
  },
  {
    icon: Activity,
    title: 'Real-time Analytics',
    description: 'Live dashboard showing risk scores, security events, and behavioral patterns during interviews.',
  },
  {
    icon: Lock,
    title: 'Session Lockdown',
    description: 'Controlled browser environment preventing tab switching, copy-paste, and unauthorized navigation.',
  },
];

export function FeaturesSection() {
  return (
    <Section id="features">
      <SectionHeader
        title="Built Different. Built Deeper."
        subtitle="A custom Chromium browser with security baked in at the native level—not bolted on as an extension."
      />

      <StaggerContainer
        staggerDelay={0.1}
        className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {features.map((feature) => (
          <StaggerItem key={feature.title}>
            <motion.div
              className="glass-premium p-6 h-full group"
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <div className="w-12 h-12 rounded-lg bg-blockd-accent/10 flex items-center justify-center mb-4 group-hover:bg-blockd-accent/20 transition-colors">
                <feature.icon className="w-6 h-6 text-blockd-accent" />
              </div>
              <h3 className="font-display text-lg font-semibold text-blockd-light mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-blockd-muted leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </Section>
  );
}
