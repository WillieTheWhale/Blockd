import { motion } from 'framer-motion';
import { Mail } from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { Section } from '@/components/landing/layout/section';
import { LandingButton } from '@/components/landing/ui/landing-button';
import { useWaitlist } from '@/contexts/waitlist-context';

// Final CTA Section

export function CTASection() {
  const { openWaitlist } = useWaitlist();

  return (
    <Section id="cta" padding="large" className="relative overflow-hidden">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.5 }}
        className="max-w-2xl mx-auto text-center relative z-10"
      >
        <motion.h2
          variants={fadeInUp}
          className="font-display text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-blockd-light mb-6"
        >
          See the Evidence for Yourself
        </motion.h2>

        <motion.p
          variants={fadeInUp}
          className="text-lg md:text-xl text-blockd-muted mb-8"
        >
          Join our waiting list to be first in line when we launch.
        </motion.p>

        <motion.div variants={fadeInUp}>
          <LandingButton
            variant="primary"
            size="lg"
            icon={<Mail className="w-5 h-5" />}
            onClick={openWaitlist}
          >
            Join Waiting List
          </LandingButton>
        </motion.div>

        {/* Trust indicators */}
        <motion.div
          variants={fadeInUp}
          className="flex flex-wrap justify-center gap-6 mt-8 text-sm text-blockd-muted"
        >
          <span className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blockd-risk-low" />
            Early access coming soon
          </span>
          <span className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blockd-risk-low" />
            Enterprise-grade security
          </span>
          <span className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blockd-risk-low" />
            SOC 2 compliant
          </span>
        </motion.div>
      </motion.div>
    </Section>
  );
}
