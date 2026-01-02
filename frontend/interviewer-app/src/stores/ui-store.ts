import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ModalState {
  isOpen: boolean
  modalId: string | null
  modalData?: unknown
}

interface UIState {
  theme: 'light' | 'dark' | 'system'
  sidebarOpen: boolean
  modal: ModalState
}

interface UIActions {
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  openModal: (modalId: string, modalData?: unknown) => void
  closeModal: () => void
}

type UIStore = UIState & UIActions

const initialState: UIState = {
  theme: 'system',
  sidebarOpen: true,
  modal: {
    isOpen: false,
    modalId: null,
    modalData: undefined,
  },
}

export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      ...initialState,

      setTheme: (theme) => {
        set({ theme })

        // Apply theme to document
        const root = window.document.documentElement
        root.classList.remove('light', 'dark')

        if (theme === 'system') {
          const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          root.classList.add(systemTheme)
        } else {
          root.classList.add(theme)
        }

        // Store theme preference
        localStorage.setItem('blockd_theme', theme)
      },

      toggleSidebar: () =>
        set((state) => ({
          sidebarOpen: !state.sidebarOpen,
        })),

      setSidebarOpen: (open) =>
        set({
          sidebarOpen: open,
        }),

      openModal: (modalId, modalData) =>
        set({
          modal: {
            isOpen: true,
            modalId,
            modalData,
          },
        }),

      closeModal: () =>
        set({
          modal: {
            isOpen: false,
            modalId: null,
            modalData: undefined,
          },
        }),
    }),
    {
      name: 'ui-store',
    }
  )
)

// Initialize theme on app start
if (typeof window !== 'undefined') {
  const storedTheme = (localStorage.getItem('blockd_theme') as 'light' | 'dark' | 'system') || 'system'
  useUIStore.getState().setTheme(storedTheme)
}
