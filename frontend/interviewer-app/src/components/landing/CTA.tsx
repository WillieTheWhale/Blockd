import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { ArrowRight, Shield } from 'lucide-react'

export function CTA() {
  const navigate = useNavigate()

  return (
    <section className="py-20 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20">
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(59,130,246,0.1),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.1),transparent_50%)]" />

          <div className="relative z-10 px-8 py-16 md:px-16 md:py-24 text-center">
            <div className="flex justify-center mb-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20">
                <Shield className="h-8 w-8 text-primary" />
              </div>
            </div>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-6 max-w-3xl mx-auto">
              Ready to Secure Your
              <span className="text-primary"> Hiring Process?</span>
            </h2>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Join 150+ companies using Blockd to ensure interview integrity.
              Start your free 14-day trial today. No credit card required.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="px-8" onClick={() => navigate('/register')}>
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="px-8">
                Schedule Demo
              </Button>
            </div>

            <p className="mt-8 text-sm text-muted-foreground">
              No credit card required &bull; 14-day free trial &bull; Cancel anytime
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
