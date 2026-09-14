import { evaluateExpression } from "../expression"
import type { TileScope } from "./types"

/**
 * Tile bindings use `{! expr }` (Salesforce UiWidgetBundle syntax) instead of
 * `{{ expr }}`. The underlying expression grammar is identical, so we reuse the
 * core evaluator — identifiers resolve on the scope root, which is why
 * `$attrs.clientName` and loop variables like `$goal.pct` work.
 */

const BINDING = /\{!([\s\S]*?)\}/g

/**
 * Resolve a single value:
 * - a string that is exactly `{! expr }` returns the raw evaluated value,
 * - a string with embedded `{! expr }` is interpolated to a string,
 * - any non-string passes through.
 */
export function evaluateTileBinding(value: unknown, scope: TileScope): unknown {
  if (typeof value !== "string") return value

  BINDING.lastIndex = 0
  const matches: { expr: string; start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = BINDING.exec(value)) !== null) {
    matches.push({ expr: m[1], start: m.index, end: m.index + m[0].length })
  }

  if (matches.length === 0) return value

  if (matches.length === 1) {
    const before = value.slice(0, matches[0].start)
    const after = value.slice(matches[0].end)
    if (before.trim() === "" && after.trim() === "") {
      return evaluateExpression(matches[0].expr, scope)
    }
  }

  let out = ""
  let cursor = 0
  for (const match of matches) {
    out += value.slice(cursor, match.start)
    const result = evaluateExpression(match.expr, scope)
    out += result == null ? "" : String(result)
    cursor = match.end
  }
  out += value.slice(cursor)
  return out
}

/** Recursively resolve every binding string inside objects and arrays. */
export function evaluateTileValue(value: unknown, scope: TileScope): unknown {
  if (typeof value === "string") return evaluateTileBinding(value, scope)
  if (Array.isArray(value)) return value.map((v) => evaluateTileValue(v, scope))
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = evaluateTileValue(v, scope)
    }
    return out
  }
  return value
}
