import { Outlet, Link, useNavigate, useLocation } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { LogoWithBackground } from '@/components/brand'
import {
  Home,
  Settings,
  LogOut,
  Menu,
  Users,
  Plus,
  Bell,
  Search,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  FileText,
  Shield,
  HelpCircle,
  Moon,
  Sun,
} from 'lucide-react'
import { getInitials, cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

const mainNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: Home },
  { label: 'Sessions', href: '/sessions', icon: Users },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Reports', href: '/reports', icon: FileText },
]

const secondaryNavItems: NavItem[] = [
  { label: 'Security', href: '/security', icon: Shield },
  { label: 'Settings', href: '/settings', icon: Settings },
  { label: 'Help', href: '/help', icon: HelpCircle },
]

export function MainLayout() {
  const { user, logout } = useAuthStore()
  const {
    sidebarOpen,
    sidebarCollapsed,
    toggleSidebar,
    toggleSidebarCollapse,
    notificationCount,
    theme,
    setTheme,
  } = useUIStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return location.pathname === '/dashboard'
    }
    return location.pathname.startsWith(href)
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center px-4 md:px-6">
          {/* Mobile Menu Button */}
          <Button variant="ghost" size="icon" className="md:hidden" onClick={toggleSidebar}>
            <Menu className="h-5 w-5" />
          </Button>

          {/* Logo */}
          <Link to="/dashboard" className="flex items-center mr-6">
            <LogoWithBackground size="md" showText variant="primary" textClassName="hidden md:inline-block" />
          </Link>

          {/* Search Bar */}
          <div className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full group">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
              <input
                type="search"
                placeholder="Search sessions, candidates..."
                className="h-9 w-full rounded-md border border-input bg-muted/50 pl-9 pr-4 text-sm placeholder:text-muted-foreground transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background focus:border-ring hover:border-muted-foreground/50 focus:bg-background"
              />
              <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex transition-opacity duration-200 group-focus-within:opacity-0">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </div>

          {/* Right Side Actions */}
          <div className="flex flex-1 items-center justify-end space-x-2 md:space-x-4">
            {/* New Session Button */}
            <Button
              size="sm"
              className="hidden md:flex"
              onClick={() => navigate('/sessions/create')}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Session
            </Button>

            {/* Theme Toggle */}
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="hidden md:flex">
              {theme === 'dark' ? (
                <Sun className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Moon className="h-5 w-5 text-muted-foreground" />
              )}
            </Button>

            {/* Notifications */}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {notificationCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
                >
                  {notificationCount > 9 ? '9+' : notificationCount}
                </Badge>
              )}
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user?.avatar} alt={user?.name} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getInitials(user?.name || 'User')}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/help')}>
                  <HelpCircle className="mr-2 h-4 w-4" />
                  <span>Help & Support</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            'fixed left-0 top-16 z-30 h-[calc(100vh-4rem)] border-r border-border/40 bg-background transition-all duration-300',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
            sidebarCollapsed ? 'w-16' : 'w-64'
          )}
        >
          <div className="flex h-full flex-col">
            {/* Collapse Toggle */}
            <div className="hidden md:flex justify-end p-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleSidebarCollapse}
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Main Navigation */}
            <nav className="flex-1 space-y-1 px-2 py-2">
              <div className={cn('mb-2', !sidebarCollapsed && 'px-2')}>
                {!sidebarCollapsed && (
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Main
                  </p>
                )}
              </div>
              {mainNavItems.map((item, index) => (
                <Link key={item.href} to={item.href}>
                  <Button
                    variant={isActive(item.href) ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full justify-start transition-all duration-200 ease-out group',
                      isActive(item.href) && 'bg-primary/10 text-primary hover:bg-primary/20 shadow-sm',
                      !isActive(item.href) && 'hover:translate-x-0.5',
                      sidebarCollapsed ? 'px-2' : 'px-3'
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <item.icon
                      className={cn(
                        'h-5 w-5 transition-transform duration-200',
                        sidebarCollapsed ? 'mx-auto' : 'mr-3',
                        !isActive(item.href) && 'group-hover:scale-110'
                      )}
                    />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                    {!sidebarCollapsed && item.badge && (
                      <Badge variant="secondary" className="ml-auto">
                        {item.badge}
                      </Badge>
                    )}
                  </Button>
                </Link>
              ))}

              {/* Secondary Navigation */}
              <div className={cn('mt-6 mb-2', !sidebarCollapsed && 'px-2')}>
                {!sidebarCollapsed && (
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Settings
                  </p>
                )}
              </div>
              {secondaryNavItems.map((item, index) => (
                <Link key={item.href} to={item.href}>
                  <Button
                    variant={isActive(item.href) ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full justify-start transition-all duration-200 ease-out group',
                      isActive(item.href) && 'bg-primary/10 text-primary hover:bg-primary/20 shadow-sm',
                      !isActive(item.href) && 'hover:translate-x-0.5',
                      sidebarCollapsed ? 'px-2' : 'px-3'
                    )}
                    style={{ animationDelay: `${(index + mainNavItems.length) * 50}ms` }}
                  >
                    <item.icon
                      className={cn(
                        'h-5 w-5 transition-transform duration-200',
                        sidebarCollapsed ? 'mx-auto' : 'mr-3',
                        !isActive(item.href) && 'group-hover:scale-110'
                      )}
                    />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </Button>
                </Link>
              ))}
            </nav>

            {/* User Card at Bottom */}
            {!sidebarCollapsed && (
              <div className="border-t border-border/40 p-4">
                <div className="flex items-center space-x-3 rounded-lg bg-muted/50 p-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user?.avatar} alt={user?.name} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getInitials(user?.name || 'User')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 md:hidden animate-fade-in"
            onClick={toggleSidebar}
          />
        )}

        {/* Main Content */}
        <main
          className={cn(
            'flex-1 transition-all duration-300 ease-out',
            sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'
          )}
        >
          <div className="container py-6 px-4 md:px-6 lg:px-8 max-w-7xl animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
