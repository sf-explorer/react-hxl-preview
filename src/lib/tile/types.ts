import type { ReactNode } from "react"

/** Any JSON value that can appear in a tile tree. */
export type TileValue =
  | string
  | number
  | boolean
  | null
  | TileValue[]
  | { [key: string]: TileValue }

/** `meta` drives control flow: iteration (`forEach`) and conditionals (`if`). */
export interface TileMeta {
  /** Binding to an array, e.g. `"{!$attrs.goals}"`. */
  forEach?: string
  /** Scope name bound to each element, e.g. `"$goal"`. */
  forItem?: string
  /** Scope name bound to each index, e.g. `"$i"`. */
  forIndex?: string
  /** Binding to a condition; a falsy result omits the node. */
  if?: string
}

/** A single node in a Salesforce UiWidgetBundle tile tree. */
export interface TileNode {
  definition: string
  attributes?: Record<string, TileValue>
  children?: TileNode[]
  meta?: TileMeta
  id?: string
}

/** The `.uiwidget` JSON payload (widgetType JSON). */
export interface TileWidgetBundle {
  type?: string
  title?: string
  contentBody: { widgetBody: TileNode }
}

/**
 * The evaluation scope. Keys are scope variables (`$attrs` at the root, plus
 * any `forItem` / `forIndex` names pushed by enclosing `forEach` nodes).
 */
export type TileScope = Record<string, unknown>

/** Props handed to a registered tile component — always fully evaluated. */
export interface TileComponentProps {
  attributes: Record<string, any>
  children?: ReactNode
}

export type TileComponentType = (props: TileComponentProps) => ReactNode

export interface TileComponentRegistry {
  register(definition: string, component: TileComponentType): void
  get(definition: string): TileComponentType | undefined
}
