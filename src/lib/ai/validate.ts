import { KNOWN_TILE_DEFINITIONS, TILE_SPEC_BY_DEFINITION } from "./catalog"

/**
 * Local pre-apply linter for an AI-produced widget bundle.
 *
 * This is the in-browser cousin of hxl-widget-build's `lint-widget.py`: it turns
 * the mistakes a model tends to make into named, local errors so the agentic
 * loop can feed them straight back instead of rendering a broken (or blank)
 * card. `errors` block the apply; `warnings` are advisory and pass.
 *
 * The renderer itself is total (unknown definitions paint a placeholder, bad
 * bindings resolve to undefined), so this favours catching *authoring* mistakes
 * over reproducing every server-side Beta-validator rule.
 */

export interface LintResult {
  errors: string[]
  warnings: string[]
}

const META_KEYS = new Set(["forEach", "forItem", "forIndex", "if"])

/** Is this string an HXL binding (`{! … }`) rather than a literal? */
function isBinding(v: unknown): v is string {
  return typeof v === "string" && v.includes("{!")
}

/** A binding string must have balanced `{!` / `}` pairs. */
function bindingBalanced(v: string): boolean {
  const opens = (v.match(/\{!/g) ?? []).length
  const closes = (v.match(/\}/g) ?? []).length
  return opens > 0 && closes >= opens
}

export function lintWidgetBundle(widget: unknown): LintResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!widget || typeof widget !== "object") {
    return { errors: ["widget must be a JSON object"], warnings }
  }
  const body = (widget as any).contentBody
  const root = body?.widgetBody
  if (!root || typeof root !== "object") {
    errors.push("widget.contentBody.widgetBody is missing")
    return { errors, warnings }
  }
  if (root.definition !== "tile/widget") {
    warnings.push('root node is usually definition "tile/widget"')
  }

  walk(root, "widgetBody", errors, warnings)
  return { errors, warnings }
}

function walk(node: any, path: string, errors: string[], warnings: string[]) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    errors.push(`${path}: node must be an object`)
    return
  }

  if (typeof node.definition !== "string") {
    errors.push(`${path}: missing string "definition"`)
  } else if (!KNOWN_TILE_DEFINITIONS.includes(node.definition)) {
    errors.push(
      `${path}: unknown tile "${node.definition}" — use one of the catalog definitions`,
    )
  }

  if (node.meta != null) validateMeta(node.meta, path, errors, warnings)

  if (node.attributes != null) {
    if (typeof node.attributes !== "object" || Array.isArray(node.attributes)) {
      errors.push(`${path}.attributes: must be an object`)
    } else {
      validateAttrs(node.definition, node.attributes, path, errors)
    }
  }

  if (node.children != null) {
    if (!Array.isArray(node.children)) {
      errors.push(`${path}.children: must be an array`)
    } else {
      node.children.forEach((child: any, i: number) =>
        walk(child, `${path}.children[${i}]`, errors, warnings),
      )
    }
  }
}

function validateMeta(meta: any, path: string, errors: string[], warnings: string[]) {
  if (typeof meta !== "object" || Array.isArray(meta)) {
    errors.push(`${path}.meta: must be an object`)
    return
  }
  for (const key of Object.keys(meta)) {
    if (!META_KEYS.has(key)) {
      warnings.push(`${path}.meta.${key}: unknown meta key (ignored by the renderer)`)
    }
  }
  if (meta.forEach != null && !isBinding(meta.forEach)) {
    errors.push(`${path}.meta.forEach: must be a binding like "{!$attrs.rows}"`)
  }
  if (meta.if != null && !isBinding(meta.if)) {
    warnings.push(`${path}.meta.if: expected a binding like "{!$attrs.flag}"`)
  }
  if (meta.forEach != null && meta.forItem != null && typeof meta.forItem !== "string") {
    errors.push(`${path}.meta.forItem: must be a scope-variable name string`)
  }
}

function validateAttrs(
  definition: unknown,
  attrs: Record<string, unknown>,
  path: string,
  errors: string[],
) {
  const spec = typeof definition === "string" ? TILE_SPEC_BY_DEFINITION[definition] : undefined

  for (const [name, value] of Object.entries(attrs)) {
    // Bindings resolve at render time — only sanity-check their syntax.
    if (isBinding(value)) {
      if (!bindingBalanced(value)) {
        errors.push(`${path}.attributes.${name}: unbalanced binding "${value}"`)
      }
      continue
    }

    const attrSpec = spec?.attrs?.find((a) => a.name === name)
    if (!attrSpec) continue // unknown attrs are tolerated by the renderer

    if (attrSpec.type === "boolean" && typeof value !== "boolean") {
      errors.push(`${path}.attributes.${name}: must be a boolean (got ${typeOf(value)})`)
    }
    if (attrSpec.type === "number" && typeof value !== "number") {
      errors.push(`${path}.attributes.${name}: must be a number (got ${typeOf(value)})`)
    }
    if (attrSpec.enum && typeof value === "string" && !attrSpec.enum.includes(value)) {
      errors.push(
        `${path}.attributes.${name}: "${value}" is not one of ${attrSpec.enum.join(", ")}`,
      )
    }
  }
}

function typeOf(v: unknown): string {
  return v === null ? "null" : Array.isArray(v) ? "array" : typeof v
}
