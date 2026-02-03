import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Mail } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useScrollAnimation } from '@/hooks/use-scroll-animation';
import { fadeInDown } from '@/lib/animations';
import { NAV_LINKS } from '@/lib/constants';
import { Container } from './container';
import { LandingButton } from '@/components/landing/ui/landing-button';
import { useWaitlist } from '@/contexts/waitlist-context';
import { LogoWithBackground } from '@/components/brand';

// Logo Component
function Logo() {
  return (
    <Link to="/" className="flex items-center" aria-label="Blockd - Home">
      <LogoWithBackground size="md" showText variant="primary" />
    </Link>
  );
}

// Mobile Menu Component
interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWaitlist: () => void;
}

function MobileMenu({ isOpen, onClose, onOpenWaitlist }: MobileMenuProps) {
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-blockd-light/60 z-40"
            onClick={onClose}
          />

          {/* Menu drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-sm z-50 bg-blockd-surface border-l-2 border-white/30"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 text-blockd-muted hover:text-blockd-light transition-colors"
              aria-label="Close menu"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Menu content */}
            <div className="flex flex-col h-full pt-20 pb-8 px-8">
              <nav className="flex-1">
                <ul className="space-y-4">
                  {NAV_LINKS.map((link, index) => (
                    <motion.li
                      key={link.label}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + index * 0.05 }}
                    >
                      <a
                        href={link.href}
                        className="block text-2xl font-display font-medium text-blockd-muted hover:text-blockd-light transition-colors py-2"
                        onClick={onClose}
                      >
                        {link.label}
                      </a>
                    </motion.li>
                  ))}
                </ul>
              </nav>

              {/* CTA buttons */}
              <div className="space-y-4">
                <LandingButton
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => {
                    onClose();
                    navigate('/login');
                  }}
                >
                  Log In
                </LandingButton>
                <LandingButton
                  variant="primary"
                  className="w-full justify-center"
                  icon={<Mail className="w-4 h-4" />}
                  onClick={() => {
                    onClose();
                    onOpenWaitlist();
                  }}
                >
                  Join Waiting List
                </LandingButton>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Navigation Component
export function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isScrolled } = useScrollAnimation();
  const { openWaitlist } = useWaitlist();
  const navigate = useNavigate();

  return (
    <>
      <motion.header
        variants={fadeInDown}
        initial="hidden"
        animate="visible"
        className={cn(
          'fixed top-0 left-0 right-0 z-50',
          'h-[72px]',
          'transition-all duration-300',
          isScrolled
            ? 'bg-blockd-void/80 backdrop-blur-xl border-b border-blockd-muted/10'
            : 'bg-transparent'
        )}
      >
        <Container className="h-full flex items-center justify-between">
          {/* Logo */}
          <Logo />

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-blockd-muted hover:text-blockd-light transition-colors duration-200 font-medium"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop CTA Buttons */}
          <div className="hidden md:flex items-center gap-4">
            <LandingButton
              variant="text"
              size="sm"
              onClick={() => navigate('/login')}
            >
              Log In
            </LandingButton>
            <LandingButton
              variant="primary"
              size="sm"
              icon={<Mail className="w-4 h-4" />}
              onClick={openWaitlist}
            >
              Join Waiting List
            </LandingButton>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 text-blockd-muted hover:text-blockd-light transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </Container>
      </motion.header>

      {/* Mobile Menu */}
      <MobileMenu
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onOpenWaitlist={openWaitlist}
      />
    </>
  );
}
