import type { EvalContext } from "./types"

/**
 * HXL expression language.
 *
 * A tiny, side-effect-free expression evaluator. Identifiers resolve on the
 * eval-context root, so `inputs.found` reads `ctx.inputs.found`.
 *
 * The public entry points never throw: on any parse or eval error they return
 * `undefined`. The experience is a declaration, not a program — there are no
 * function calls, assignments or comments.
 */

// ---------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------

type TokenType =
  | "number"
  | "string"
  | "ident"
  | "punct"
  | "eof"

interface Token {
  type: TokenType
  value: string
}

const PUNCT = [
  "||",
  "&&",
  "==",
  "!=",
  "<=",
  ">=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
  "(",
  ")",
  "[",
  "]",
  ".",
]

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = input.length

  while (i < n) {
    const c = input[i]

    // Whitespace
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++
      continue
    }

    // Strings
    if (c === '"' || c === "'") {
      const quote = c
      let value = ""
      i++
      while (i < n && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < n) {
          const next = input[i + 1]
          switch (next) {
            case "n":
              value += "\n"
              break
            case "t":
              value += "\t"
              break
            case "r":
              value += "\r"
              break
            case "\\":
              value += "\\"
              break
            case '"':
              value += '"'
              break
            case "'":
              value += "'"
              break
            default:
              value += next
          }
          i += 2
        } else {
          value += input[i]
          i++
        }
      }
      if (i >= n) throw new Error("Unterminated string")
      i++ // closing quote
      tokens.push({ type: "string", value })
      continue
    }

    // Numbers (including exponent)
    if (isDigit(c) || (c === "." && isDigit(input[i + 1]))) {
      let value = ""
      while (i < n && isDigit(input[i])) value += input[i++]
      if (input[i] === ".") {
        value += input[i++]
        while (i < n && isDigit(input[i])) value += input[i++]
      }
      if (input[i] === "e" || input[i] === "E") {
        value += input[i++]
        if (input[i] === "+" || input[i] === "-") value += input[i++]
        while (i < n && isDigit(input[i])) value += input[i++]
      }
      tokens.push({ type: "number", value })
      continue
    }

    // Identifiers / keywords
    if (isIdentStart(c)) {
      let value = ""
      while (i < n && isIdentPart(input[i])) value += input[i++]
      tokens.push({ type: "ident", value })
      continue
    }

    // Punctuation (longest match first)
    const punct = PUNCT.find((p) => input.startsWith(p, i))
    if (punct) {
      tokens.push({ type: "punct", value: punct })
      i += punct.length
      continue
    }

    throw new Error(`Unexpected character: ${c}`)
  }

  tokens.push({ type: "eof", value: "" })
  return tokens
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9"
}

function isIdentStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "$"
}

function isIdentPart(c: string): boolean {
  return isIdentStart(c) || isDigit(c)
}

// ---------------------------------------------------------------------------
// Parser (recursive descent) + evaluator
//
// The parser evaluates as it descends, resolving against `ctx`. Precedence,
// low to high: || , && , == != , < <= > >= , + - , * / % , unary ! - , primary.
// ---------------------------------------------------------------------------

const KEYWORDS: Record<string, unknown> = {
  true: true,
  false: false,
  null: null,
  undefined: undefined,
}

class Parser {
  private pos = 0

  constructor(
    private readonly tokens: Token[],
    private readonly ctx: EvalContext,
  ) {}

  private peek(): Token {
    return this.tokens[this.pos]
  }

  private next(): Token {
    return this.tokens[this.pos++]
  }

  private eat(value: string): void {
    const t = this.peek()
    if (t.type === "punct" && t.value === value) {
      this.pos++
      return
    }
    throw new Error(`Expected '${value}'`)
  }

  private isPunct(value: string): boolean {
    const t = this.peek()
    return t.type === "punct" && t.value === value
  }

  /** Parse a full expression and assert the input is exhausted. */
  parse(): unknown {
    const value = this.parseOr()
    if (this.peek().type !== "eof") throw new Error("Trailing input")
    return value
  }

  private parseOr(): unknown {
    let left = this.parseAnd()
    while (this.isPunct("||")) {
      this.next()
      const right = this.parseAnd()
      left = left || right
    }
    return left
  }

  private parseAnd(): unknown {
    let left = this.parseEquality()
    while (this.isPunct("&&")) {
      this.next()
      const right = this.parseEquality()
      left = left && right
    }
    return left
  }

  private parseEquality(): unknown {
    let left = this.parseComparison()
    while (this.isPunct("==") || this.isPunct("!=")) {
      const op = this.next().value
      const right = this.parseComparison()
      left = op === "==" ? left === right : left !== right
    }
    return left
  }

  private parseComparison(): unknown {
    let left = this.parseAdditive()
    while (
      this.isPunct("<") ||
      this.isPunct("<=") ||
      this.isPunct(">") ||
      this.isPunct(">=")
    ) {
      const op = this.next().value
      const right = this.parseAdditive()
      left = compare(op, left, right)
    }
    return left
  }

  private parseAdditive(): unknown {
    let left = this.parseMultiplicative()
    while (this.isPunct("+") || this.isPunct("-")) {
      const op = this.next().value
      const right = this.parseMultiplicative()
      if (op === "+") {
        if (typeof left === "number" && typeof right === "number") {
          left = left + right
        } else {
          left = String(left ?? "") + String(right ?? "")
        }
      } else {
        left = toNum(left) - toNum(right)
      }
    }
    return left
  }

  private parseMultiplicative(): unknown {
    let left = this.parseUnary()
    while (this.isPunct("*") || this.isPunct("/") || this.isPunct("%")) {
      const op = this.next().value
      const right = this.parseUnary()
      const a = toNum(left)
      const b = toNum(right)
      if (op === "*") {
        left = a * b
      } else if (b === 0) {
        // Division or modulo by zero → undefined
        left = undefined
      } else {
        left = op === "/" ? a / b : a % b
      }
    }
    return left
  }

  private parseUnary(): unknown {
    if (this.isPunct("!")) {
      this.next()
      return !this.parseUnary()
    }
    if (this.isPunct("-")) {
      this.next()
      return -toNum(this.parseUnary())
    }
    return this.parsePostfix()
  }

  /** Primary value followed by any chain of `.member` / `[index]` accesses. */
  private parsePostfix(): unknown {
    let value = this.parsePrimary()
    for (;;) {
      if (this.isPunct(".")) {
        this.next()
        const t = this.next()
        if (t.type !== "ident") throw new Error("Expected property name")
        value = member(value, t.value)
      } else if (this.isPunct("[")) {
        this.next()
        const key = this.parseOr()
        this.eat("]")
        value = member(value, key as PropertyKey)
      } else {
        break
      }
    }
    return value
  }

  private parsePrimary(): unknown {
    const t = this.peek()

    if (this.isPunct("(")) {
      this.next()
      const value = this.parseOr()
      this.eat(")")
      return value
    }

    if (t.type === "number") {
      this.next()
      return Number(t.value)
    }

    if (t.type === "string") {
      this.next()
      return t.value
    }

    if (t.type === "ident") {
      this.next()
      if (Object.prototype.hasOwnProperty.call(KEYWORDS, t.value)) {
        return KEYWORDS[t.value]
      }
      // Root identifier resolves on the eval-context root.
      return member(this.ctx, t.value)
    }

    throw new Error(`Unexpected token: ${t.value || t.type}`)
  }
}

function member(obj: unknown, key: PropertyKey): unknown {
  if (obj == null) return undefined
  if (typeof obj !== "object" && typeof obj !== "string") {
    // Primitives other than string have no readable HXL members.
    return undefined
  }
  return (obj as Record<PropertyKey, unknown>)[key]
}

function toNum(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (!Number.isNaN(n)) return n
  }
  return NaN
}

function compare(op: string, left: unknown, right: unknown): unknown {
  const bothNumbers = typeof left === "number" && typeof right === "number"
  const bothStrings = typeof left === "string" && typeof right === "string"
  if (!bothNumbers && !bothStrings) return undefined
  switch (op) {
    case "<":
      return (left as any) < (right as any)
    case "<=":
      return (left as any) <= (right as any)
    case ">":
      return (left as any) > (right as any)
    case ">=":
      return (left as any) >= (right as any)
    default:
      return undefined
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Evaluate a raw expression string. Never throws; returns `undefined` on error. */
export function evaluateExpression(expr: string, ctx: EvalContext): unknown {
  try {
    return new Parser(tokenize(expr), ctx).parse()
  } catch {
    return undefined
  }
}

const BINDING = /\{\{([\s\S]*?)\}\}/g

/**
 * Resolve binding syntax in a single value.
 *
 * - A string that is exactly `{{ expr }}` returns the raw evaluated value.
 * - A string with embedded `{{ expr }}` is interpolated to a string
 *   (missing/nullish values become `""`).
 * - Any non-string value passes through unchanged.
 */
export function evaluateBinding(value: unknown, ctx: EvalContext): unknown {
  if (typeof value !== "string") return value

  // Collect all bindings and the text spans between them.
  BINDING.lastIndex = 0
  const matches: { expr: string; start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = BINDING.exec(value)) !== null) {
    matches.push({ expr: m[1], start: m.index, end: m.index + m[0].length })
  }

  if (matches.length === 0) return value // literal string

  // Exactly one binding, surrounded only by whitespace → raw value.
  if (matches.length === 1) {
    const before = value.slice(0, matches[0].start)
    const after = value.slice(matches[0].end)
    if (before.trim() === "" && after.trim() === "") {
      return evaluateExpression(matches[0].expr, ctx)
    }
  }

  // Otherwise interpolate into a string.
  let out = ""
  let cursor = 0
  for (const match of matches) {
    out += value.slice(cursor, match.start)
    const result = evaluateExpression(match.expr, ctx)
    out += result == null ? "" : String(result)
    cursor = match.end
  }
  out += value.slice(cursor)
  return out
}

/**
 * Recursively walk objects and arrays, applying `evaluateBinding` to every
 * string. This is what the renderer runs on `node.props`.
 */
export function evaluateValue(value: unknown, ctx: EvalContext): unknown {
  if (typeof value === "string") return evaluateBinding(value, ctx)
  if (Array.isArray(value)) return value.map((v) => evaluateValue(v, ctx))
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = evaluateValue(v, ctx)
    }
    return out
  }
  return value
}
