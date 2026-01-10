import { Outlet, Link } from 'react-router'
import { Shield } from 'lucide-react'

export function AuthLayout() {
  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/20 via-primary/10 to-background relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.1),transparent_50%)]" />

        <div className="relative z-10 flex flex-col justify-between p-12">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="font-bold text-2xl">Blockd</span>
          </Link>

          {/* Main Content */}
          <div className="space-y-6">
            <h1 className="text-4xl font-bold leading-tight">
              Secure Your<br />
              <span className="text-primary">Hiring Process</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-md">
              AI-powered interview security platform that detects cheating,
              monitors eye movement, and ensures interview integrity.
            </p>

            {/* Features List */}
            <div className="space-y-3 pt-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-sm text-muted-foreground">99.2% AI detection accuracy</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-sm text-muted-foreground">Real-time eye tracking analysis</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-sm text-muted-foreground">Secure browser lockdown</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-sm text-muted-foreground">
            Trusted by 150+ enterprise companies worldwide
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <Link to="/" className="inline-flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl">Blockd</span>
            </Link>
          </div>

          <Outlet />
        </div>
      </div>
    </div>
  )
}
