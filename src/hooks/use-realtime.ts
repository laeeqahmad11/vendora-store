import * as React from 'react'
import {
  collection,
  doc,
  onSnapshot,
  query,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { convertDocTimestamps, snapToDoc } from '@/services/firestore'

interface RealtimeState<T> {
  data: T
  isLoading: boolean
  isError: boolean
  error: Error | null
}

/**
 * Live Firestore collection subscription (onSnapshot). Returns the same
 * { data, isLoading, isError } shape as TanStack Query so pages can swap a
 * useQuery call for this hook without touching their render logic.
 *
 * `constraints` are rebuilt every render, so memoize the deps via `deps` —
 * the subscription is (re)created only when `enabled` or `deps` change.
 */
export function useRealtimeCollection<T>(
  collectionName: string,
  constraints: QueryConstraint[],
  deps: React.DependencyList,
  enabled = true,
): RealtimeState<T[] | undefined> {
  const [state, setState] = React.useState<RealtimeState<T[] | undefined>>({
    data: undefined,
    isLoading: enabled,
    isError: false,
    error: null,
  })
  // Keep latest constraints without re-subscribing on every render
  const constraintsRef = React.useRef(constraints)
  constraintsRef.current = constraints

  React.useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, isLoading: false }))
      return
    }
    setState((s) => ({ ...s, isLoading: s.data === undefined, isError: false, error: null }))
    const q = query(collection(db, collectionName), ...constraintsRef.current)
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setState({ data: snap.docs.map((d) => snapToDoc<T>(d)), isLoading: false, isError: false, error: null })
      },
      (error) => {
        console.error(`Realtime subscription failed (${collectionName}):`, error)
        setState((s) => ({ ...s, isLoading: false, isError: true, error }))
      },
    )
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, enabled, ...deps])

  return state
}

/** Live single-document subscription. `data === null` means "doesn't exist". */
export function useRealtimeDoc<T>(
  collectionName: string,
  id: string | undefined,
  enabled = true,
): RealtimeState<T | null | undefined> {
  const [state, setState] = React.useState<RealtimeState<T | null | undefined>>({
    data: undefined,
    isLoading: enabled && !!id,
    isError: false,
    error: null,
  })

  React.useEffect(() => {
    if (!enabled || !id) {
      setState((s) => ({ ...s, isLoading: false }))
      return
    }
    setState((s) => ({ ...s, isLoading: s.data === undefined, isError: false, error: null }))
    const unsubscribe = onSnapshot(
      doc(db, collectionName, id),
      (snap) => {
        setState({
          data: snap.exists() ? ({ id: snap.id, ...convertDocTimestamps(snap.data()) } as T) : null,
          isLoading: false,
          isError: false,
          error: null,
        })
      },
      (error) => {
        console.error(`Realtime subscription failed (${collectionName}/${id}):`, error)
        setState((s) => ({ ...s, isLoading: false, isError: true, error }))
      },
    )
    return unsubscribe
  }, [collectionName, id, enabled])

  return state
}
