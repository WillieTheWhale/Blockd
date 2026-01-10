import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface ModalState {
  isOpen: boolean
  modalId: string | null
  modalData?: unknown
}

interface UIState {
  theme: 'light' | 'dark' | 'system'
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  modal: ModalState
  notificationCount: number
  commandPaletteOpen: boolean
}

interface UIActions {
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebarCollapse: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  openModal: (modalId: string, modalData?: unknown) => void
  closeModal: () => void
  setNotificationCount: (count: number) => void
  incrementNotificationCount: () => void
  clearNotifications: () => void
  toggleCommandPalette: () => void
  setCommandPaletteOpen: (open: boolean) => void
}

type UIStore = UIState & UIActions

const initialState: UIState = {
  theme: 'dark',
  sidebarOpen: true,
  sidebarCollapsed: false,
  modal: {
    isOpen: false,
    modalId: null,
    modalData: undefined,
  },
  notificationCount: 0,
  commandPaletteOpen: false,
}

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
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
        },

        toggleSidebar: () =>
          set((state) => ({
            sidebarOpen: !state.sidebarOpen,
          })),

        setSidebarOpen: (open) =>
          set({
            sidebarOpen: open,
          }),

        toggleSidebarCollapse: () =>
          set((state) => ({
            sidebarCollapsed: !state.sidebarCollapsed,
          })),

        setSidebarCollapsed: (collapsed) =>
          set({
            sidebarCollapsed: collapsed,
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

        setNotificationCount: (count) =>
          set({
            notificationCount: count,
          }),

        incrementNotificationCount: () =>
          set((state) => ({
            notificationCount: state.notificationCount + 1,
          })),

        clearNotifications: () =>
          set({
            notificationCount: 0,
          }),

        toggleCommandPalette: () =>
          set((state) => ({
            commandPaletteOpen: !state.commandPaletteOpen,
          })),

        setCommandPaletteOpen: (open) =>
          set({
            commandPaletteOpen: open,
          }),
      }),
      {
        name: 'blockd-ui-store',
        partialize: (state) => ({
          theme: state.theme,
          sidebarCollapsed: state.sidebarCollapsed,
        }),
      }
    ),
    {
      name: 'ui-store',
    }
  )
)

// Initialize theme on app start
if (typeof window !== 'undefined') {
  const state = useUIStore.getState()
  state.setTheme(state.theme)
}
