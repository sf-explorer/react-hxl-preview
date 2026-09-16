/**
 * Pull a single JSON object out of a model's reply.
 *
 * Models wrap JSON in prose or ```json fences even when told not to. We first
 * try a fenced block, then fall back to scanning for the first balanced
 * top-level `{ … }` (string-aware, so braces inside strings don't fool it).
 */
export function extractJson(text: string): unknown {
  const candidate = fencedBlock(text) ?? firstBalancedObject(text) ?? text.trim()
  return JSON.parse(candidate)
}

function fencedBlock(text: string): string | null {
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  return m ? m[1].trim() : null
}

function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{")
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === "\\") escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}
