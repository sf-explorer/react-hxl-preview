import { Fragment, createElement, useMemo } from "react"
import type { ReactNode } from "react"
import type {
  HxlComponentNode,
  HxlComponentRegistry,
  HxlExperience,
  HxlRenderContext,
} from "./types"
import { evaluateValue } from "./expression"
import { HxlContextProvider } from "./context"

/** Render a single node. A missing `type` paints a neutral placeholder. */
function renderNode(
  node: HxlComponentNode,
  ctx: HxlRenderContext,
  key?: React.Key,
): ReactNode {
  const Component = ctx.registry.get(node.type)
  if (!Component) {
    return (
      <span key={key} className="abui-hxl-unknown">
        Unknown component: {String(node.type)}
      </span>
    )
  }

  const evaluatedProps = evaluateValue(node.props ?? {}, ctx.evalCtx) as Record<
    string,
    unknown
  >
  const children =
    node.children && node.children.length > 0
      ? ctx.renderNodes(node.children)
      : undefined

  return createElement(Component, { key, props: evaluatedProps, children })
}

/** Map a list of nodes to elements with stable keys. Re-entrant. */
function renderNodes(
  nodes: readonly HxlComponentNode[],
  ctx: HxlRenderContext,
): ReactNode {
  return nodes.map((node, i) => (
    <Fragment key={i}>{renderNode(node, ctx, i)}</Fragment>
  ))
}

export interface HxlRendererProps {
  experience: HxlExperience
  inputs?: Record<string, unknown>
  registry: HxlComponentRegistry
}

/**
 * Render an HXL experience. Bindings resolve against `inputs.*`. The renderer
 * is total: a bad tree still paints (unknown types become placeholders, bad
 * expressions become `undefined`). Passing a new `inputs` re-evaluates the
 * same tree.
 */
export function HxlRenderer({
  experience,
  inputs = {},
  registry,
}: HxlRendererProps) {
  const ctx = useMemo<HxlRenderContext>(() => {
    const context: HxlRenderContext = {
      evalCtx: { inputs },
      registry,
      renderNodes: (nodes) => renderNodes(nodes, context),
    }
    return context
  }, [inputs, registry])

  return (
    <HxlContextProvider value={ctx}>
      {renderNode(experience.root, ctx)}
    </HxlContextProvider>
  )
}

export interface HxlSurfaceProps extends HxlRendererProps {
  /** Optional agent display name shown above the tree. */
  agentName?: string
}

/**
 * `HxlRenderer` wrapped in the Kanopi conversation-surface chrome
 * (display name + title heading).
 */
export function HxlSurface({ agentName, experience, ...rest }: HxlSurfaceProps) {
  return (
    <div className="abui-hxl-surface">
      {agentName && <span className="abui-display-name">{agentName}</span>}
      {experience.title && (
        <div className="abui-hxl-title">{experience.title}</div>
      )}
      <div className="abui-hxl-body">
        <HxlRenderer experience={experience} {...rest} />
      </div>
    </div>
  )
}
