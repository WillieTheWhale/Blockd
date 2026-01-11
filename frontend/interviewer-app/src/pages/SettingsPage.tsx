import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useUIStore } from '@/stores/ui-store'
import { useAuthStore } from '@/stores/auth-store'
import { stripUndefined } from '@/lib/utils'
import {
  profileUpdateSchema,
  passwordChangeSchema,
  type ProfileUpdateFormData,
  type PasswordChangeFormData,
} from '@/lib/validations'
import { Loader2, QrCode, Shield, Bell, Key, Building2, Eye, EyeOff } from 'lucide-react'

export function SettingsPage() {
  const { theme, setTheme } = useUIStore()
  const { user, updateProfile, changePassword, setupMfa, disableMfa, mfaSetupData } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [showMfaSetup, setShowMfaSetup] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const profileForm = useForm<ProfileUpdateFormData>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      avatar: user?.avatar || '',
    },
  })

  const passwordForm = useForm<PasswordChangeFormData>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const handleProfileUpdate = async (data: ProfileUpdateFormData) => {
    // Strip undefined values for exactOptionalPropertyTypes compliance
    // Cast needed because RHF returns `| undefined` for optional fields
    const cleanData = stripUndefined(data as Record<string, unknown>) as ProfileUpdateFormData
    const result = await updateProfile(cleanData)
    if (result.success) {
      toast.success('Profile updated', {
        description: 'Your profile has been updated successfully.',
      })
    } else {
      toast.error('Update failed', {
        description: 'Failed to update profile. Please try again.',
      })
    }
  }

  const handlePasswordChange = async (data: PasswordChangeFormData) => {
    const result = await changePassword(data.currentPassword, data.newPassword)
    if (result.success) {
      toast.success('Password changed', {
        description: 'Your password has been changed successfully.',
      })
      passwordForm.reset()
    } else {
      toast.error('Change failed', {
        description: 'Failed to change password. Please try again.',
      })
    }
  }

  const handleMfaSetup = async () => {
    setIsLoading(true)
    const result = await setupMfa()
    setIsLoading(false)
    if (result.success) {
      setShowMfaSetup(true)
      toast.success('MFA setup', {
        description: 'Scan the QR code with your authenticator app.',
      })
    } else {
      toast.error('Setup failed', {
        description: 'Failed to setup MFA. Please try again.',
      })
    }
  }

  const handleMfaDisable = async () => {
    const code = prompt('Enter your 6-digit authentication code to disable MFA:')
    if (!code) return

    setIsLoading(true)
    const result = await disableMfa(code)
    setIsLoading(false)
    if (result.success) {
      toast.success('MFA disabled', {
        description: 'Two-factor authentication has been disabled.',
      })
      setShowMfaSetup(false)
    } else {
      toast.error('Failed', {
        description: 'Invalid code or failed to disable MFA.',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your account and application preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={profileForm.handleSubmit(handleProfileUpdate)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    {...profileForm.register('name')}
                    disabled={profileForm.formState.isSubmitting}
                  />
                  {profileForm.formState.errors.name && (
                    <p className="text-sm text-red-500">
                      {profileForm.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    {...profileForm.register('email')}
                    disabled={profileForm.formState.isSubmitting}
                  />
                  {profileForm.formState.errors.email && (
                    <p className="text-sm text-red-500">
                      {profileForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="avatar">Avatar URL</Label>
                  <Input
                    id="avatar"
                    type="url"
                    placeholder="https://example.com/avatar.jpg"
                    {...profileForm.register('avatar')}
                    disabled={profileForm.formState.isSubmitting}
                  />
                  {profileForm.formState.errors.avatar && (
                    <p className="text-sm text-red-500">
                      {profileForm.formState.errors.avatar.message}
                    </p>
                  )}
                </div>

                <Button type="submit" disabled={profileForm.formState.isSubmitting}>
                  {profileForm.formState.isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Profile'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>View your account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role:</span>
                <span className="font-medium capitalize">{user?.role || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account Created:</span>
                <span className="font-medium">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your password to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(handlePasswordChange)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showPassword ? 'text' : 'password'}
                      {...passwordForm.register('currentPassword')}
                      disabled={passwordForm.formState.isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  {passwordForm.formState.errors.currentPassword && (
                    <p className="text-sm text-red-500">
                      {passwordForm.formState.errors.currentPassword.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    {...passwordForm.register('newPassword')}
                    disabled={passwordForm.formState.isSubmitting}
                  />
                  {passwordForm.formState.errors.newPassword && (
                    <p className="text-sm text-red-500">
                      {passwordForm.formState.errors.newPassword.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    {...passwordForm.register('confirmPassword')}
                    disabled={passwordForm.formState.isSubmitting}
                  />
                  {passwordForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-red-500">
                      {passwordForm.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
                  {passwordForm.formState.isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Changing...
                    </>
                  ) : (
                    'Change Password'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>
                Add an extra layer of security to your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showMfaSetup ? (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <Label>MFA Status</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Two-factor authentication is currently disabled
                    </p>
                  </div>
                  <Button onClick={handleMfaSetup} disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <QrCode className="mr-2 h-4 w-4" />
                    )}
                    Enable MFA
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center p-4 bg-white rounded-lg">
                    {mfaSetupData?.qrCode && (
                      <img
                        src={mfaSetupData.qrCode}
                        alt="MFA QR Code"
                        className="w-48 h-48"
                      />
                    )}
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium">Scan this QR code with your authenticator app</p>
                    {mfaSetupData?.secret && (
                      <p className="text-xs text-muted-foreground">
                        Secret: <code className="bg-muted px-2 py-1 rounded">{mfaSetupData.secret}</code>
                      </p>
                    )}
                  </div>
                  <Button variant="destructive" onClick={handleMfaDisable} className="w-full">
                    Disable MFA
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Manage your API keys for external integrations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    <Label>API Access</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Generate and manage API keys
                  </p>
                </div>
                <Button variant="outline">
                  <Key className="mr-2 h-4 w-4" />
                  Generate Key
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>Configure which emails you want to receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Session Started</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications when a session starts
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Security Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified about suspicious activities
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Session Completed</Label>
                  <p className="text-sm text-muted-foreground">
                    Notifications when sessions are completed
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Weekly Reports</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive weekly summary reports
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Push Notifications</CardTitle>
              <CardDescription>Manage browser push notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    <Label>Browser Notifications</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Enable push notifications in your browser
                  </p>
                </div>
                <Button variant="outline">Enable</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Customize the look and feel of the application</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="theme">Color Theme</Label>
                <Select
                  value={theme}
                  onValueChange={(value: 'light' | 'dark' | 'system') => setTheme(value)}
                >
                  <SelectTrigger id="theme" className="w-64">
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Choose your preferred color theme for the application
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
              <CardDescription>Manage organization-wide settings (Admin only)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {user?.role === 'admin' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        <Label>Organization Name</Label>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Update your organization name
                      </p>
                    </div>
                    <Button variant="outline">Edit</Button>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Default Session Settings</Label>
                      <p className="text-sm text-muted-foreground">
                        Set default settings for new sessions
                      </p>
                    </div>
                    <Button variant="outline">Configure</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Only administrators can access organization settings
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
