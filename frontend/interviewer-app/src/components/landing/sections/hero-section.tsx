import { motion } from 'framer-motion';
import { Play, Mail } from 'lucide-react';
import { heroHeadline, heroCharacter, fadeInUp, pageLoadSequence } from '@/lib/animations';
import { Container } from '@/components/landing/layout/container';
import { LandingButton } from '@/components/landing/ui/landing-button';
import { HeroDashboard } from '@/components/landing/dashboard/hero-dashboard';
import { StaticSpotlight } from '@/components/landing/effects/spotlight';
import { GridPattern } from '@/components/landing/effects/grid-pattern';
import { useWaitlist } from '@/contexts/waitlist-context';

// Hero Section - Enhanced with Glitch Effect

const headline = 'Evidence, Not Accusations.';

function AnimatedHeadline() {
  const words = headline.split(' ');
  let charIndex = 0;

  return (
    <div className="relative">
      {/* Main headline with character animation */}
      <motion.h1
        variants={heroHeadline}
        initial="hidden"
        animate="visible"
        className="font-display text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight text-blockd-light relative z-10"
      >
        {words.map((word, wordIndex) => (
          <span key={wordIndex} className="inline-block whitespace-nowrap">
            {word.split('').map((char) => {
              const currentIndex = charIndex++;
              return (
                <motion.span
                  key={currentIndex}
                  variants={heroCharacter}
                  className="inline-block"
                >
                  {char}
                </motion.span>
              );
            })}
            {wordIndex < words.length - 1 && (
              <span className="inline-block">&nbsp;</span>
            )}
          </span>
        ))}
      </motion.h1>

      {/* Glitch layers - subtle chromatic aberration effect */}
      <motion.div
        className="absolute inset-0 font-display text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight text-blockd-accent/30 pointer-events-none select-none"
        style={{ clipPath: 'inset(20% 0 60% 0)' }}
        initial={{ opacity: 0 }}
        animate={{
          x: [0, -2, 2, -1, 0],
          opacity: [0, 0.5, 0.5, 0.5, 0],
        }}
        transition={{
          duration: 0.15,
          delay: 2,
          repeat: Infinity,
          repeatDelay: 4,
        }}
        aria-hidden="true"
      >
        {headline}
      </motion.div>

      <motion.div
        className="absolute inset-0 font-display text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight text-red-500/20 pointer-events-none select-none"
        style={{ clipPath: 'inset(60% 0 20% 0)' }}
        initial={{ opacity: 0 }}
        animate={{
          x: [0, 2, -2, 1, 0],
          opacity: [0, 0.3, 0.3, 0.3, 0],
        }}
        transition={{
          duration: 0.15,
          delay: 2.1,
          repeat: Infinity,
          repeatDelay: 4,
        }}
        aria-hidden="true"
      >
        {headline}
      </motion.div>
    </div>
  );
}

export function HeroSection() {
  const { openWaitlist } = useWaitlist();

  return (
    <section id="hero" className="relative min-h-screen flex items-center pt-[72px] overflow-hidden">
      {/* Background effects */}
      <GridPattern className="opacity-50" />
      <StaticSpotlight position="top-right" size={1000} color="rgba(104, 113, 147, 0.08)" />
      <StaticSpotlight position="bottom-left" size={800} color="rgba(104, 113, 147, 0.05)" />

      <Container className="py-16 md:py-20 lg:py-24 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left column - Text content */}
          <div className="space-y-8">
            <AnimatedHeadline />

            <motion.p
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={{ delay: pageLoadSequence.subhead.delay }}
              className="text-lg md:text-xl text-blockd-muted leading-relaxed max-w-lg"
            >
              Our custom Chromium browser delivers what extensions can't: native-level gaze tracking, multi-LLM detection, and deep security monitoring—comprehensive evidence for every hiring decision.
            </motion.p>

            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={{ delay: pageLoadSequence.ctas.delay }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <LandingButton
                variant="primary"
                size="lg"
                icon={<Mail className="w-5 h-5" />}
                onClick={openWaitlist}
              >
                Join Waiting List
              </LandingButton>
              <LandingButton
                variant="secondary"
                size="lg"
                icon={<Play className="w-5 h-5" />}
              >
                Watch Demo
              </LandingButton>
            </motion.div>

            {/* Trust indicators */}
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={{ delay: pageLoadSequence.dashboard.delay }}
              className="flex flex-wrap gap-6 text-sm text-blockd-muted"
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
          </div>

          {/* Right column - Dashboard preview */}
          <div className="relative">
            <HeroDashboard />

            {/* Decorative elements */}
            <motion.div
              className="absolute -z-10 inset-0 blur-3xl opacity-30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              transition={{ delay: 1, duration: 1 }}
              style={{
                background: 'radial-gradient(circle at center, rgba(104, 113, 147, 0.2) 0%, transparent 70%)',
              }}
            />
          </div>
        </div>
      </Container>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2, duration: 0.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className="w-6 h-10 rounded-full border-2 border-blockd-muted/30 flex justify-center pt-2"
        >
          <div className="w-1 h-2 rounded-full bg-blockd-muted/50" />
        </motion.div>
      </motion.div>
    </section>
  );
}
