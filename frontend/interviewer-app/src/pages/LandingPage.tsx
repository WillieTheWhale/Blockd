import { lazy, Suspense } from 'react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { WaitlistProvider } from '@/contexts/waitlist-context';
import { WaitlistModal } from '@/components/landing/ui/waitlist-modal';
import { Navigation } from '@/components/landing/layout/navigation';
import { Footer } from '@/components/landing/layout/footer';
import { HeroSection } from '@/components/landing/sections/hero-section';
import { ProblemSection } from '@/components/landing/sections/problem-section';
import { FeaturesSection } from '@/components/landing/sections/features-section';
import { PricingSection } from '@/components/landing/sections/pricing-section';
import { CTASection } from '@/components/landing/sections/cta-section';

// Lazy load heavy effects components
const ScrollProgress = lazy(() =>
  import('@/components/landing/effects/scroll-progress').then((mod) => ({
    default: mod.ScrollProgress,
  }))
);

const CursorGlow = lazy(() =>
  import('@/components/landing/effects/cursor-glow').then((mod) => ({
    default: mod.CursorGlow,
  }))
);

const ScrollBackgroundGradient = lazy(() =>
  import('@/components/landing/effects/scroll-background-gradient').then((mod) => ({
    default: mod.ScrollBackgroundGradient,
  }))
);

export function LandingPage() {
  return (
    <WaitlistProvider>
      <TooltipProvider>
        <div className="landing-page min-h-screen bg-blockd-void text-blockd-light">
          {/* Waitlist Modal */}
          <WaitlistModal />

          {/* Background Effects */}
          <Suspense fallback={null}>
            <ScrollBackgroundGradient />
            <ScrollProgress />
            <CursorGlow />
          </Suspense>

          {/* Navigation */}
          <Navigation />

          {/* Main Content */}
          <main id="main-content" className="relative z-10">
            <HeroSection />
            <ProblemSection />
            <FeaturesSection />
            <PricingSection />
            <CTASection />
          </main>

          {/* Footer */}
          <Footer />
        </div>
      </TooltipProvider>
    </WaitlistProvider>
  );
}
