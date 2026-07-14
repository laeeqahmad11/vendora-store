import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/constants'
import { getDocById, updateDocument } from '@/services/firestore'
import type { UserProfile, UserRole } from '@/types'

/** Creates the Firestore profile for a newly authenticated user (idempotent). */
async function ensureUserProfile(user: FirebaseUser, displayName?: string): Promise<UserProfile> {
  const ref = doc(db, COLLECTIONS.users, user.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return { id: snap.id, ...snap.data() } as UserProfile

  const profile = {
    email: user.email ?? '',
    displayName: displayName ?? user.displayName ?? user.email?.split('@')[0] ?? 'User',
    photoURL: user.photoURL ?? '',
    role: 'customer' as UserRole, // roles are elevated server-side / by admin only
    emailVerified: user.emailVerified,
    suspended: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  await setDoc(ref, profile)
  return { id: user.uid, ...profile, createdAt: Date.now(), updatedAt: Date.now() } as UserProfile
}

export const authService = {
  async register(email: string, password: string, displayName: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })
    await sendEmailVerification(cred.user).catch(() => {}) // non-fatal
    return ensureUserProfile(cred.user, displayName)
  },

  async login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    return ensureUserProfile(cred.user)
  },

  async loginWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider)
    return ensureUserProfile(cred.user)
  },

  async logout() {
    await signOut(auth)
  },

  async forgotPassword(email: string) {
    await sendPasswordResetEmail(auth, email)
  },

  async resendVerification() {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser)
  },

  async fetchProfile(uid: string) {
    return getDocById<UserProfile>(COLLECTIONS.users, uid)
  },

  async updateProfileData(uid: string, data: Partial<Pick<UserProfile, 'displayName' | 'phone' | 'photoURL'>>) {
    await updateDocument(COLLECTIONS.users, uid, data)
    if (auth.currentUser && data.displayName) {
      await updateProfile(auth.currentUser, { displayName: data.displayName })
    }
  },
}
