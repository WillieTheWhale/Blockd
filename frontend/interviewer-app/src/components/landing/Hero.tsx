import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Play, Shield, Eye, Brain, Lock } from 'lucide-react'

export function Hero() {
  const navigate = useNavigate()

  return (
    <section className="relative overflow-hidden py-20 md:py-32">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-3xl opacity-50" />

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          {/* Badge */}
          <Badge variant="outline" className="mb-6 py-1.5 px-4 text-sm">
            <span className="mr-2 text-primary">New</span>
            AI-Powered Interview Security
          </Badge>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            Secure Your
            <span className="text-primary"> Hiring Process</span>
            <br />with AI Detection
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-8">
            Blockd uses advanced AI and behavioral analysis to ensure interview integrity.
            Detect AI-assisted answers, monitor eye movement, and protect against cheating
            in real-time.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-16">
            <Button size="lg" className="px-8" onClick={() => navigate('/register')}>
              Start Free Trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="px-8">
              <Play className="mr-2 h-5 w-5" />
              Watch Demo
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 w-full max-w-3xl">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-primary">99.2%</div>
              <div className="text-sm text-muted-foreground mt-1">AI Detection Rate</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-primary">500K+</div>
              <div className="text-sm text-muted-foreground mt-1">Interviews Secured</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-primary">150+</div>
              <div className="text-sm text-muted-foreground mt-1">Enterprise Clients</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-primary">&lt;50ms</div>
              <div className="text-sm text-muted-foreground mt-1">Real-time Analysis</div>
            </div>
          </div>
        </div>

        {/* Feature Icons */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-3 p-4 rounded-xl border border-border/40 bg-card/50">
            <Brain className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">AI Detection</span>
          </div>
          <div className="flex items-center justify-center gap-3 p-4 rounded-xl border border-border/40 bg-card/50">
            <Eye className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">Eye Tracking</span>
          </div>
          <div className="flex items-center justify-center gap-3 p-4 rounded-xl border border-border/40 bg-card/50">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">Security Monitor</span>
          </div>
          <div className="flex items-center justify-center gap-3 p-4 rounded-xl border border-border/40 bg-card/50">
            <Lock className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">Browser Lock</span>
          </div>
        </div>
      </div>
    </section>
  )
}
