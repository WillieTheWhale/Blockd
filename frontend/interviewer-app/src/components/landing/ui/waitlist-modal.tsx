import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useWaitlist } from '@/contexts/waitlist-context';
import { LandingInput } from './landing-input';
import { LandingButton } from './landing-button';

// Waitlist Modal Component
// Email collection modal for the waiting list

type SubmitStatus = 'idle' | 'loading' | 'success' | 'error';

export function WaitlistModal() {
  const { isOpen, closeWaitlist } = useWaitlist();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [message, setMessage] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setStatus('idle');
      setMessage('');
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeWaitlist();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeWaitlist]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!email.trim()) {
        setStatus('error');
        setMessage('Please enter your email address');
        return;
      }

      setStatus('loading');

      // Simulate API call - in production, this would call the actual waitlist API
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        setStatus('success');
        setMessage('We\'ll notify you when Blockd launches!');
      } catch {
        setStatus('error');
        setMessage('Failed to connect. Please try again.');
      }
    },
    [email]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            onClick={closeWaitlist}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={cn(
                'relative w-full max-w-md',
                'bg-blockd-void border border-blockd-accent/20',
                'rounded-2xl shadow-2xl shadow-blockd-accent/10',
                'overflow-hidden'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative gradient */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blockd-accent via-blue-500 to-blockd-accent" />

              {/* Close button */}
              <button
                onClick={closeWaitlist}
                className="absolute top-4 right-4 p-2 text-blockd-muted hover:text-blockd-light transition-colors rounded-lg hover:bg-blockd-surface/50"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Content */}
              <div className="p-8">
                {status === 'success' ? (
                  // Success state
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-4"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', delay: 0.1 }}
                      className="w-16 h-16 mx-auto mb-6 rounded-full bg-blockd-risk-low/20 flex items-center justify-center"
                    >
                      <CheckCircle className="w-8 h-8 text-blockd-risk-low" />
                    </motion.div>
                    <h3 className="text-2xl font-display font-bold text-blockd-light mb-2">
                      You're on the list!
                    </h3>
                    <p className="text-blockd-muted mb-6">{message}</p>
                    <LandingButton variant="secondary" onClick={closeWaitlist}>
                      Close
                    </LandingButton>
                  </motion.div>
                ) : (
                  // Form state
                  <>
                    <div className="text-center mb-6">
                      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-blockd-accent/20 flex items-center justify-center">
                        <Mail className="w-6 h-6 text-blockd-accent" />
                      </div>
                      <h3 className="text-2xl font-display font-bold text-blockd-light mb-2">
                        Join the Waiting List
                      </h3>
                      <p className="text-blockd-muted text-sm">
                        Be the first to know when Blockd launches. We'll notify you with early access and exclusive updates.
                      </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <LandingInput
                        type="email"
                        placeholder="Enter your work email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (status === 'error') {
                            setStatus('idle');
                            setMessage('');
                          }
                        }}
                        error={status === 'error' ? message : undefined}
                        disabled={status === 'loading'}
                        autoFocus
                      />

                      <LandingButton
                        type="submit"
                        variant="primary"
                        className="w-full justify-center"
                        disabled={status === 'loading'}
                      >
                        {status === 'loading' ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Joining...
                          </>
                        ) : (
                          'Join Waiting List'
                        )}
                      </LandingButton>
                    </form>

                    {/* Privacy note */}
                    <p className="mt-4 text-xs text-center text-blockd-muted/60">
                      We respect your privacy. No spam, ever.
                    </p>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
