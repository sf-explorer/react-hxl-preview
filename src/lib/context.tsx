import { createContext, useContext } from "react"
import type { HxlRenderContext } from "./types"

const HxlContext = createContext<HxlRenderContext | null>(null)

export const HxlContextProvider = HxlContext.Provider

/**
 * Access the ambient render context. Composite components (tabs, accordion)
 * and custom components that embed HXL sub-trees use `renderNodes` from here.
 */
export function useHxlContext(): HxlRenderContext {
  const ctx = useContext(HxlContext)
  if (!ctx) {
    throw new Error("HXL components must be rendered inside <HxlRenderer>")
  }
  return ctx
}
