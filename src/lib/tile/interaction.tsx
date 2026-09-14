import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"

/**
 * Interactive tile support.
 *
 * The base tile renderer is display-only. Input tiles (`tile/select`,
 * `tile/textField`, …) and action buttons (`tile/button` with `actions.click`)
 * need two shared capabilities that the pure walk can't provide:
 *
 *  1. A **live input store** keyed by each input's `id`, so that a button can
 *     gather the current field values at click time (`inputs: "auto"`).
 *  2. A **dispatch sink** that surfaces the action + gathered payload — in the
 *     preview that's a toast, mirroring the live HXL playground.
 *
 * Both hang off one context. With no provider present the context is inert
 * (inputs stay locally interactive, buttons simply don't toast), so a tile used
 * outside `TileWidgetRenderer` still renders and never throws.
 */

/** One action fired by a button click, with the payload gathered for it. */
export interface DispatchedEvent {
  action: string
  payload: Record<string, unknown>
}

interface TileInteraction {
  /** Write the current value of an input into the shared store. */
  setValue: (id: string, value: unknown) => void
  /** Snapshot every registered input value as a plain `{ id: value }` object. */
  snapshot: () => Record<string, unknown>
  /** Surface a batch of dispatched actions (renders the toast). */
  dispatch: (events: DispatchedEvent[]) => void
}

const INERT: TileInteraction = {
  setValue: () => {},
  snapshot: () => ({}),
  dispatch: () => {},
}

const TileInteractionContext = createContext<TileInteraction>(INERT)

export function useTileInteraction(): TileInteraction {
  return useContext(TileInteractionContext)
}

/**
 * Bind an input tile to the shared store. Returns the current value and a
 * setter that updates both local render state and the store snapshot. The
 * initial value is seeded into the store on mount so a button can gather it
 * even if the user never touches the field.
 */
export function useField<T>(
  id: string | undefined,
  initial: T,
): [T, (value: T) => void] {
  const { setValue } = useTileInteraction()
  const [value, setLocal] = useState<T>(initial)

  // Adopt the bound initial value: seed the shared store on mount, and re-sync
  // whenever the underlying data (`initial`) changes — e.g. the demo's editable
  // `$attrs`. User edits go through `update`, which doesn't touch `initial`, so
  // typed values are never clobbered by this. (`initial` is a primitive here.)
  useEffect(() => {
    setLocal(initial)
    if (id) setValue(id, initial)
  }, [id, initial, setValue])

  const update = useCallback(
    (next: T) => {
      setLocal(next)
      if (id) setValue(id, next)
    },
    [id, setValue],
  )

  return [value, update]
}

const TOAST_MS = 6000

export function TileInteractionProvider({ children }: { children: ReactNode }) {
  const values = useRef<Record<string, unknown>>({})
  const [toast, setToast] = useState<DispatchedEvent[] | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const setValue = useCallback((id: string, value: unknown) => {
    if (id) values.current[id] = value
  }, [])

  const snapshot = useCallback(() => ({ ...values.current }), [])

  const dispatch = useCallback((events: DispatchedEvent[]) => {
    setToast(events)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const api = useMemo<TileInteraction>(
    () => ({ setValue, snapshot, dispatch }),
    [setValue, snapshot, dispatch],
  )

  return (
    <TileInteractionContext.Provider value={api}>
      {children}
      {toast && <TileToast events={toast} onClose={() => setToast(null)} />}
    </TileInteractionContext.Provider>
  )
}

function TileToast({
  events,
  onClose,
}: {
  events: DispatchedEvent[]
  onClose: () => void
}) {
  return (
    <div className="tile-toast" role="status" aria-live="polite">
      <button
        type="button"
        className="tile-toast-close"
        onClick={onClose}
        aria-label="Dismiss"
      >
        ×
      </button>
      {events.map((event, i) => (
        <div className="tile-toast-event" key={i}>
          <div className="tile-toast-action">
            dispatched <code>{event.action}</code>
          </div>
          <pre className="tile-toast-payload">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  )
}
