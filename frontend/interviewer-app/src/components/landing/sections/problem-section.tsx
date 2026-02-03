import { motion } from 'framer-motion';
import { fadeInUp } from '@/lib/animations';
import { Section, SectionHeader } from '@/components/landing/layout/section';
import { DetectionComparisonChart } from '@/components/landing/visualizations/risk-gauge';
import { useCountup } from '@/hooks/use-countup';
import { SectionWrapper, StaggerContainer, StaggerItem } from '@/components/landing/ui/section-wrapper';

// Problem Section - Enhanced with Cinematic Transitions

const detectionData = [
  { label: 'Tab Switching', traditional: 70, blockd: 98 },
  { label: 'AI Assistance', traditional: 15, blockd: 95 },
  { label: 'Second Monitor', traditional: 25, blockd: 92 },
  { label: 'VM Usage', traditional: 10, blockd: 99 },
];

function StatCallout() {
  const { ref, count } = useCountup({
    end: 73,
    duration: 1500,
    decimals: 0,
  });

  return (
    <motion.div
      ref={ref}
      variants={fadeInUp}
      className="glass-premium p-8 text-center relative overflow-hidden group"
    >
      {/* Animated glow on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-blockd-accent/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <motion.p
        className="text-6xl md:text-7xl font-mono font-bold text-blockd-accent tabular-nums relative"
        animate={{
          textShadow: [
            '0 0 20px rgba(104, 113, 147, 0.3)',
            '0 0 40px rgba(104, 113, 147, 0.5)',
            '0 0 20px rgba(104, 113, 147, 0.3)',
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        {count}%
      </motion.p>
      <p className="text-lg text-blockd-muted mt-4 max-w-sm mx-auto relative">
        of students admit to cheating on online assessments
      </p>
      <p className="text-sm text-blockd-muted/60 mt-2 relative">
        — Stanford University Study
      </p>
    </motion.div>
  );
}

export function ProblemSection() {
  return (
    <Section id="problem">
      <SectionWrapper transition="blur" delay={0}>
        <SectionHeader
          title="Cheating Has Evolved. Detection Must Too."
          subtitle="Browser extensions see less than half the picture. Our custom Chromium browser with native desktop integration achieves 95%+ detection rates across AI assistance, VM usage, and screen recording."
        />
      </SectionWrapper>

      <StaggerContainer
        staggerDelay={0.15}
        delayChildren={0.2}
        className="grid lg:grid-cols-2 gap-12 items-center"
      >
        {/* Detection Comparison Chart */}
        <StaggerItem>
          <motion.div
            className="glass-premium p-8 relative overflow-hidden"
            whileHover={{ scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <h3 className="font-display text-xl font-semibold text-blockd-light mb-6">
              Detection Rate Comparison
            </h3>
            <DetectionComparisonChart data={detectionData} />
          </motion.div>
        </StaggerItem>

        {/* Stat Callout */}
        <StaggerItem>
          <StatCallout />
        </StaggerItem>
      </StaggerContainer>

      {/* Section divider */}
      <motion.div
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="mt-16 h-px bg-gradient-to-r from-transparent via-blockd-accent/30 to-transparent"
      />
    </Section>
  );
}
