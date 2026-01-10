import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Brain,
  Eye,
  Shield,
  Video,
  BarChart3,
  Clock,
  Users,
  FileText,
  Zap,
  Lock,
  Monitor,
  AlertTriangle,
} from 'lucide-react'

const features = [
  {
    icon: Brain,
    title: 'AI Answer Detection',
    description:
      'Compare candidate responses against GPT-4, Claude, and Gemini to detect AI-assisted answers with 99.2% accuracy.',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    icon: Eye,
    title: 'Eye Tracking Analysis',
    description:
      'Real-time gaze detection using MediaPipe to identify reading patterns, off-screen glances, and suspicious behavior.',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    icon: Shield,
    title: 'Security Monitoring',
    description:
      'Detect screen recording software, virtual machines, browser extensions, and other cheating tools automatically.',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    icon: Video,
    title: 'HD Video Recording',
    description:
      'Crystal-clear WebRTC video streaming with automatic recording and playback for post-interview review.',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  {
    icon: Clock,
    title: 'Response Timing',
    description:
      'Analyze response latency, speech patterns, and hesitation to identify unnatural answer preparation.',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  {
    icon: BarChart3,
    title: 'Risk Scoring',
    description:
      'Comprehensive risk assessment combining all signals into an actionable score with detailed breakdowns.',
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  {
    icon: Lock,
    title: 'Browser Lockdown',
    description:
      'Custom Chromium browser prevents tab switching, copy-paste, and access to external resources during interviews.',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  {
    icon: Monitor,
    title: 'Screen Monitoring',
    description:
      'Track window focus, detect application switching, and monitor for suspicious desktop activity.',
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
  },
  {
    icon: AlertTriangle,
    title: 'Real-time Alerts',
    description:
      'Instant notifications when suspicious behavior is detected, allowing immediate interviewer intervention.',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  {
    icon: FileText,
    title: 'Detailed Reports',
    description:
      'Generate comprehensive PDF reports with timestamps, evidence, and actionable insights for hiring decisions.',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description:
      'Share sessions with hiring managers, add notes, and collaborate on candidate evaluations in real-time.',
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
  },
  {
    icon: Zap,
    title: 'Instant Setup',
    description:
      'Get started in minutes with our simple onboarding. No complex integrations or IT involvement required.',
    color: 'text-lime-500',
    bgColor: 'bg-lime-500/10',
  },
]

export function Features() {
  return (
    <section id="features" className="py-20 md:py-32 bg-muted/30">
      <div className="container mx-auto px-4 md:px-6">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Everything You Need for
            <span className="text-primary"> Secure Interviews</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Our comprehensive suite of AI-powered tools ensures complete interview integrity
            while providing actionable insights for better hiring decisions.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="border-border/40 bg-card/50 hover:bg-card/80 transition-colors"
            >
              <CardHeader>
                <div className={`w-12 h-12 rounded-lg ${feature.bgColor} flex items-center justify-center mb-4`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-muted-foreground">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
