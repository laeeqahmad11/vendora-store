import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  serverTimestamp,
  Timestamp,
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { stripUndefined } from '@/lib/utils'

/**
 * Thin generic layer over Firestore. Documents are stored with Firestore
 * Timestamps; this layer converts them to epoch milliseconds on read so the
 * rest of the app works with plain numbers.
 */

export function convertDocTimestamps(data: DocumentData): DocumentData {
  return convertTimestamps(data)
}

function convertTimestamps(data: DocumentData): DocumentData {
  const out: DocumentData = {}
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Timestamp) out[k] = v.toMillis()
    else if (Array.isArray(v)) out[k] = v.map((i) => (i instanceof Timestamp ? i.toMillis() : i))
    else out[k] = v
  }
  return out
}

export function snapToDoc<T>(snap: QueryDocumentSnapshot): T {
  return { id: snap.id, ...convertTimestamps(snap.data()) } as T
}

export async function getDocById<T>(collectionName: string, id: string): Promise<T | null> {
  const snap = await getDoc(doc(db, collectionName, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...convertTimestamps(snap.data()!) } as T
}

export async function queryDocs<T>(collectionName: string, ...constraints: QueryConstraint[]): Promise<T[]> {
  const snap = await getDocs(query(collection(db, collectionName), ...constraints))
  return snap.docs.map((d) => snapToDoc<T>(d))
}

export async function createDocument<T extends { id?: string }>(
  collectionName: string,
  data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
  id?: string,
): Promise<string> {
  const ref = id ? doc(db, collectionName, id) : doc(collection(db, collectionName))
  await setDoc(ref, {
    ...stripUndefined(data as Record<string, unknown>),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateDocument(
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await updateDoc(doc(db, collectionName, id), {
    ...stripUndefined(data),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteDocument(collectionName: string, id: string): Promise<void> {
  await deleteDoc(doc(db, collectionName, id))
}
