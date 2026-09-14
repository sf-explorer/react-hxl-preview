import { createElement } from "react"
import type { ReactNode } from "react"
import { evaluateExpression } from "../expression"
import { evaluateTileValue } from "./expression"
import type {
  TileComponentRegistry,
  TileNode,
  TileScope,
  TileWidgetBundle,
} from "./types"

/**
 * Render a single tile node against the current scope.
 *
 * Control flow runs before the component is looked up:
 *  1. `meta.if` — a falsy condition omits the node entirely.
 *  2. `meta.forEach` — iterate the bound array, pushing `forItem` / `forIndex`
 *     onto a child scope and re-rendering the node once per element.
 *
 * The renderer is total: an unknown `definition` paints a neutral placeholder
 * and a bad binding resolves to `undefined`. It never throws.
 */
function renderTileNode(
  node: TileNode,
  scope: TileScope,
  registry: TileComponentRegistry,
  key?: React.Key,
): ReactNode {
  const meta = node.meta

  // 1. Conditional
  if (meta?.if != null) {
    const cond = evalBinding(meta.if, scope)
    if (!cond) return null
  }

  // 2. Iteration — render the node (minus its control meta) once per element.
  if (meta?.forEach != null) {
    const list = evalBinding(meta.forEach, scope)
    if (!Array.isArray(list)) return null
    const itemName = meta.forItem ?? "$item"
    const indexName = meta.forIndex
    const inner: TileNode = { ...node, meta: undefined }
    return list.map((item, i) => {
      const childScope: TileScope = { ...scope, [itemName]: item }
      if (indexName) childScope[indexName] = i
      return renderTileNode(inner, childScope, registry, i)
    })
  }

  const Component = registry.get(node.definition)
  if (!Component) {
    return (
      <span key={key} className="tile-unknown">
        Unknown tile: {String(node.definition)}
      </span>
    )
  }

  const attributes = evaluateTileValue(node.attributes ?? {}, scope) as Record<
    string,
    unknown
  >
  const children =
    node.children && node.children.length > 0
      ? node.children.map((child, i) => renderTileNode(child, scope, registry, i))
      : undefined

  return createElement(Component, { key, attributes, children })
}

/** A binding string (`{! expr }`) evaluated to its raw value. */
function evalBinding(binding: string, scope: TileScope): unknown {
  const inner = /^\s*\{!([\s\S]*)\}\s*$/.exec(binding)
  return evaluateExpression(inner ? inner[1] : binding, scope)
}

export interface TileWidgetRendererProps {
  /** The full `.uiwidget` JSON bundle. */
  widget: TileWidgetBundle
  /** The `$attrs` data the widget binds against. */
  attrs?: Record<string, unknown>
  registry: TileComponentRegistry
}

/** Render a Salesforce UiWidgetBundle (JSON widgetType) tile tree. */
export function TileWidgetRenderer({
  widget,
  attrs = {},
  registry,
}: TileWidgetRendererProps) {
  const root = widget?.contentBody?.widgetBody
  if (!root) return null
  const scope: TileScope = { $attrs: attrs }
  return <>{renderTileNode(root, scope, registry, 0)}</>
}
