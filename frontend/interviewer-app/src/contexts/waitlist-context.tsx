import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Waitlist Context
// Manages the global state for the waitlist modal

interface WaitlistContextType {
  isOpen: boolean;
  openWaitlist: () => void;
  closeWaitlist: () => void;
}

const WaitlistContext = createContext<WaitlistContextType | undefined>(undefined);

interface WaitlistProviderProps {
  children: ReactNode;
}

export function WaitlistProvider({ children }: WaitlistProviderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const openWaitlist = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeWaitlist = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <WaitlistContext.Provider value={{ isOpen, openWaitlist, closeWaitlist }}>
      {children}
    </WaitlistContext.Provider>
  );
}

export function useWaitlist() {
  const context = useContext(WaitlistContext);
  if (context === undefined) {
    throw new Error('useWaitlist must be used within a WaitlistProvider');
  }
  return context;
}
