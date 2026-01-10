import { Card, CardContent } from '@/components/ui/card'
import { CalendarPlus, Download, Video, FileCheck } from 'lucide-react'

const steps = [
  {
    step: 1,
    icon: CalendarPlus,
    title: 'Create a Session',
    description:
      'Schedule an interview session and add your questions. Invite the candidate with a secure link.',
  },
  {
    step: 2,
    icon: Download,
    title: 'Candidate Joins',
    description:
      'Candidate downloads the secure Blockd browser and joins the session. Security checks run automatically.',
  },
  {
    step: 3,
    icon: Video,
    title: 'Conduct Interview',
    description:
      'Interview proceeds while our AI monitors in real-time. Get instant alerts for suspicious activity.',
  },
  {
    step: 4,
    icon: FileCheck,
    title: 'Review Results',
    description:
      'Access detailed analytics, risk scores, and video recordings. Generate reports for hiring decisions.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            How It
            <span className="text-primary"> Works</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Get started in minutes with our simple four-step process. No complex setup required.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((item, index) => (
            <div key={item.step} className="relative">
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-12 left-[60%] w-full h-0.5 bg-border" />
              )}

              <Card className="border-border/40 bg-card/50 relative">
                <CardContent className="pt-6">
                  {/* Step Number */}
                  <div className="absolute -top-4 left-6 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    {item.step}
                  </div>

                  {/* Icon */}
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 mt-2">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>

                  {/* Content */}
                  <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {/* Additional Info */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-8 p-6 rounded-xl border border-border/40 bg-card/50">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">5 min</div>
              <div className="text-xs text-muted-foreground">Setup Time</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">Zero</div>
              <div className="text-xs text-muted-foreground">IT Required</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">24/7</div>
              <div className="text-xs text-muted-foreground">Support</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
