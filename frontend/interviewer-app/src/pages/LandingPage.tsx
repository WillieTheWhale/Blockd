import { Hero } from '@/components/landing/Hero'
import { Features } from '@/components/landing/Features'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { Pricing } from '@/components/landing/Pricing'
import { Download } from '@/components/landing/Download'
import { CTA } from '@/components/landing/CTA'

export function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <Download />
      <CTA />
    </div>
  )
}
