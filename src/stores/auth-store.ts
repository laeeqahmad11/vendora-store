import { create } from 'zustand'
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { authService } from '@/services/auth.service'
import { storesService } from '@/services/stores.service'
import type { Store, UserProfile, UserRole } from '@/types'

interface AuthState {
  firebaseUser: FirebaseUser | null
  profile: UserProfile | null
  /** Merchant's store (loaded when role === merchant or an application exists) */
  store: Store | null
  loading: boolean
  initialized: boolean
  role: UserRole | null
  setProfile: (profile: UserProfile | null) => void
  setStore: (store: Store | null) => void
  refreshProfile: () => Promise<void>
  refreshStore: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  profile: null,
  store: null,
  loading: true,
  initialized: false,
  role: null,
  setProfile: (profile) => set({ profile, role: profile?.role ?? null }),
  setStore: (store) => set({ store }),
  refreshProfile: async () => {
    const user = get().firebaseUser
    if (!user) return
    const profile = await authService.fetchProfile(user.uid)
    set({ profile, role: profile?.role ?? null })
  },
  refreshStore: async () => {
    const user = get().firebaseUser
    if (!user) return set({ store: null })
    const store = await storesService.getByOwner(user.uid)
    set({ store })
  },
}))

/** Wire the Firebase auth listener exactly once (called from App) */
let unsubscribe: (() => void) | null = null
export function initAuthListener() {
  if (unsubscribe) return
  unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      useAuthStore.setState({
        firebaseUser: null,
        profile: null,
        store: null,
        role: null,
        loading: false,
        initialized: true,
      })
      return
    }
    useAuthStore.setState({ firebaseUser: user, loading: true })
    try {
      const profile = await authService.fetchProfile(user.uid)
      const store = profile ? await storesService.getByOwner(user.uid) : null
      useAuthStore.setState({
        profile,
        store,
        role: profile?.role ?? null,
        loading: false,
        initialized: true,
      })
    } catch {
      useAuthStore.setState({ loading: false, initialized: true })
    }
  })
}
