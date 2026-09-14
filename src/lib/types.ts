import type { ReactNode } from "react"

/** Any JSON-serialisable value that can appear in the tree. */
export type HxlValue =
  | string
  | number
  | boolean
  | null
  | HxlValue[]
  | { [key: string]: HxlValue }

/** A single node in the declarative component tree. */
export interface HxlComponentNode {
  type: string
  props?: Record<string, HxlValue>
  children?: HxlComponentNode[]
}

/** A complete experience: a tree plus optional host-chrome title. */
export interface HxlExperience {
  title?: string
  root: HxlComponentNode
}

/** What an agent typically sends over the wire (kind `"hxl"`). */
export interface HxlItem {
  kind: "hxl"
  widgetName: string
  experience: HxlExperience
  inputs: Record<string, unknown>
  /** Chrome only; not used by the tree walker. */
  agentName?: string
}

/** The root object bindings resolve against — always `{ inputs }`. */
export type EvalContext = Record<string, unknown>

/** Props handed to a registered component — always fully evaluated. */
export interface HxlComponentProps {
  props: Record<string, any>
  children?: ReactNode
}

export type HxlComponentType = (props: HxlComponentProps) => ReactNode

export interface HxlComponentRegistry {
  register(type: string, component: HxlComponentType): void
  get(type: string): HxlComponentType | undefined
}

/** Ambient render context; required by composites (tabs, accordion). */
export interface HxlRenderContext {
  evalCtx: EvalContext
  registry: HxlComponentRegistry
  renderNodes(nodes: readonly HxlComponentNode[]): ReactNode
}
