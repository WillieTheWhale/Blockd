import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { loginSchema, type LoginFormData } from '@/lib/validations'
import type { LoginCredentials } from '@/types'
import { Loader2 } from 'lucide-react'
import { OAuthButton } from '@/components/OAuthButton'

export function LoginPage() {
  const navigate = useNavigate()
  const { login, isLoading, mfaRequired } = useAuthStore()
  const [showMfaInput, setShowMfaInput] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
      mfaCode: '',
    },
  })

  const onSubmit = async (data: LoginFormData) => {
    try {
      const credentials: LoginCredentials = {
        email: data.email,
        password: data.password,
      }
      if (data.mfaCode) credentials.mfaCode = data.mfaCode
      if (data.rememberMe !== undefined) credentials.rememberMe = data.rememberMe

      const result = await login(credentials)

      if (result.requiresMfa) {
        setShowMfaInput(true)
        toast.info('MFA Required', {
          description: 'Please enter your 6-digit authentication code',
        })
        return
      }

      if (result.success) {
        toast.success('Welcome back!', {
          description: 'You have successfully logged in.',
        })
        navigate('/dashboard')
      } else {
        toast.error('Login failed', {
          description: 'Please check your credentials and try again.',
        })
      }
    } catch (error) {
      toast.error('Login failed', {
        description: error instanceof Error ? error.message : 'An error occurred',
      })
    }
  }

  const rememberMe = watch('rememberMe')

  return (
    <Card className="border-border/40">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
        <CardDescription>
          Enter your credentials to access your account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              {...register('email')}
              disabled={isLoading}
              aria-invalid={errors.email ? 'true' : 'false'}
              className="bg-background"
            />
            {errors.email && (
              <p className="text-sm text-destructive" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                to="/forgot-password"
                className="text-sm text-primary hover:underline"
                tabIndex={-1}
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              {...register('password')}
              disabled={isLoading}
              aria-invalid={errors.password ? 'true' : 'false'}
              className="bg-background"
            />
            {errors.password && (
              <p className="text-sm text-destructive" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          {(showMfaInput || mfaRequired) && (
            <div className="space-y-2">
              <Label htmlFor="mfaCode">Authentication Code</Label>
              <Input
                id="mfaCode"
                type="text"
                placeholder="000000"
                maxLength={6}
                {...register('mfaCode')}
                disabled={isLoading}
                aria-invalid={errors.mfaCode ? 'true' : 'false'}
                className="bg-background text-center text-lg tracking-widest"
              />
              {errors.mfaCode && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.mfaCode.message}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="rememberMe"
              checked={rememberMe ?? false}
              onCheckedChange={(checked) => setValue('rememberMe', checked as boolean)}
              disabled={isLoading}
            />
            <Label
              htmlFor="rememberMe"
              className="text-sm font-normal cursor-pointer"
            >
              Remember me for 30 days
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <OAuthButton provider="google" disabled={isLoading} />
          <OAuthButton provider="microsoft" disabled={isLoading} />
        </div>

        <div className="text-center text-sm">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Sign up
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
