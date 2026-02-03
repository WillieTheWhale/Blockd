import { motion } from 'framer-motion';
import { Check, Mail } from 'lucide-react';
import { Section, SectionHeader } from '@/components/landing/layout/section';
import { LandingButton } from '@/components/landing/ui/landing-button';
import { StaggerContainer, StaggerItem } from '@/components/landing/ui/section-wrapper';
import { useWaitlist } from '@/contexts/waitlist-context';
import { cn } from '@/lib/cn';

// Pricing Section

const plans = [
  {
    name: 'Starter',
    price: '$49',
    period: '/month',
    description: 'Perfect for small teams getting started',
    features: [
      'Up to 50 seats',
      'Basic gaze tracking',
      'AI detection',
      'Standard reports',
      'Email support',
    ],
    highlighted: false,
  },
  {
    name: 'Professional',
    price: '$149',
    period: '/month',
    description: 'For growing companies with serious hiring',
    features: [
      'Up to 200 seats',
      'Advanced gaze tracking',
      'Multi-LLM AI detection',
      'Detailed evidence reports',
      'Security monitoring',
      'Priority support',
      'API access',
    ],
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations with custom needs',
    features: [
      'Unlimited seats',
      'Custom integrations',
      'Dedicated support',
      'SLA guarantees',
      'On-premise option',
      'Custom branding',
      'Advanced analytics',
    ],
    highlighted: false,
  },
];

export function PricingSection() {
  const { openWaitlist } = useWaitlist();

  return (
    <Section id="scale">
      <SectionHeader
        title="Simple, Transparent Pricing"
        subtitle="Start with what you need, scale as you grow. All plans include our core detection technology."
      />

      <StaggerContainer
        staggerDelay={0.1}
        className="grid md:grid-cols-3 gap-6 lg:gap-8"
      >
        {plans.map((plan) => (
          <StaggerItem key={plan.name}>
            <motion.div
              className={cn(
                'glass-premium p-8 h-full flex flex-col relative',
                plan.highlighted && 'border-blockd-accent/50 ring-1 ring-blockd-accent/20'
              )}
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blockd-accent text-blockd-void text-xs font-bold uppercase tracking-wider">
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <h3 className="font-display text-xl font-semibold text-blockd-light mb-2">
                  {plan.name}
                </h3>
                <p className="text-sm text-blockd-muted">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-blockd-light">{plan.price}</span>
                <span className="text-blockd-muted">{plan.period}</span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-blockd-risk-low flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-blockd-muted">{feature}</span>
                  </li>
                ))}
              </ul>

              <LandingButton
                variant={plan.highlighted ? 'primary' : 'secondary'}
                className="w-full justify-center"
                icon={<Mail className="w-4 h-4" />}
                onClick={openWaitlist}
              >
                Join Waiting List
              </LandingButton>
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </Section>
  );
}
