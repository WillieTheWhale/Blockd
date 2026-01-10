import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const plans = [
  {
    name: 'Starter',
    description: 'Perfect for small teams getting started',
    price: '$49',
    period: '/month',
    features: [
      'Up to 10 interviews/month',
      'AI answer detection',
      'Basic eye tracking',
      'Video recording (7 days)',
      'Email support',
      '1 interviewer seat',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Professional',
    description: 'For growing teams with advanced needs',
    price: '$199',
    period: '/month',
    features: [
      'Up to 100 interviews/month',
      'Advanced AI detection (4 LLMs)',
      'Full eye tracking & heatmaps',
      'Video recording (30 days)',
      'Security monitoring',
      'Priority support',
      '5 interviewer seats',
      'Custom branding',
      'API access',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    description: 'For large organizations with custom requirements',
    price: 'Custom',
    period: '',
    features: [
      'Unlimited interviews',
      'All Professional features',
      'Custom AI training',
      'Unlimited video storage',
      'SSO & SAML integration',
      'Dedicated account manager',
      'Unlimited seats',
      'On-premise deployment',
      'SLA guarantee',
      'Custom integrations',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
]

export function Pricing() {
  const navigate = useNavigate()

  return (
    <section id="pricing" className="py-20 md:py-32 bg-muted/30">
      <div className="container mx-auto px-4 md:px-6">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Simple, Transparent
            <span className="text-primary"> Pricing</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Choose the plan that fits your hiring needs. All plans include a 14-day free trial.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={cn(
                'relative border-border/40 bg-card/50',
                plan.popular && 'border-primary shadow-glow'
              )}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
              )}
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <ul className="space-y-3 text-left">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={plan.popular ? 'default' : 'outline'}
                  onClick={() => navigate('/register')}
                >
                  {plan.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* FAQ Link */}
        <div className="mt-16 text-center">
          <p className="text-muted-foreground">
            Have questions?{' '}
            <a href="#" className="text-primary hover:underline">
              Check our FAQ
            </a>{' '}
            or{' '}
            <a href="#" className="text-primary hover:underline">
              contact us
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  )
}
