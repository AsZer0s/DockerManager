import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: number
  username: string
  email: string
  role: 'admin' | 'user'
  telegramId?: number
}

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  user: User | null
  login: (token: string, user: User) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      token: null,
      user: null,
      
      login: (token: string, user: User) => {
        set({
          isAuthenticated: true,
          token,
          user,
        })
      },
      
      logout: () => {
        set({
          isAuthenticated: false,
          token: null,
          user: null,
        })
      },
      
      updateUser: (userData: Partial<User>) => {
        const currentUser = get().user
        if (currentUser) {
          set({
            user: { ...currentUser, ...userData }
          })
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        token: state.token,
        user: state.user,
      }),
    }
  )
)
