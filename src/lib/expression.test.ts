import { describe, it, expect } from "vitest"
import {
  evaluateBinding,
  evaluateExpression,
  evaluateValue,
} from "./expression"

describe("evaluateBinding", () => {
  it("returns the raw value for an exact binding", () => {
    expect(evaluateBinding("{{ inputs.found }}", { inputs: { found: 7 } })).toBe(7)
  })

  it("preserves types through an exact binding", () => {
    expect(evaluateBinding("{{ inputs.ok }}", { inputs: { ok: true } })).toBe(true)
    expect(evaluateBinding("{{ inputs.obj }}", { inputs: { obj: { a: 1 } } })).toEqual({ a: 1 })
  })

  it("interpolates embedded bindings to a string", () => {
    expect(evaluateBinding("n={{ inputs.found }}", { inputs: { found: 7 } })).toBe("n=7")
  })

  it("turns missing values into undefined (exact) or '' (embedded)", () => {
    expect(evaluateBinding("{{ inputs.missing }}", { inputs: {} })).toBeUndefined()
    expect(evaluateBinding("x={{ inputs.missing }}", { inputs: {} })).toBe("x=")
  })

  it("passes non-strings and literal strings through", () => {
    expect(evaluateBinding(42, {})).toBe(42)
    expect(evaluateBinding("plain text", {})).toBe("plain text")
  })
})

describe("evaluateExpression — operators", () => {
  const ctx = { inputs: { a: 1, b: 2, s: "hi", arr: [10, 20], map: { k: 5 } } }

  it("logical && returns the right operand", () => {
    expect(evaluateBinding("{{ inputs.a && inputs.b }}", ctx)).toBe(2)
  })

  it("logical || short-circuits", () => {
    expect(evaluateExpression("inputs.missing || 9", ctx)).toBe(9)
  })

  it("strict equality", () => {
    expect(evaluateExpression("inputs.a == 1", ctx)).toBe(true)
    expect(evaluateExpression("inputs.a != 2", ctx)).toBe(true)
  })

  it("comparison on numbers and strings only", () => {
    expect(evaluateExpression("inputs.a < inputs.b", ctx)).toBe(true)
    expect(evaluateExpression("'a' < 'b'", ctx)).toBe(true)
    expect(evaluateExpression("inputs.a < inputs.s", ctx)).toBeUndefined()
  })

  it("arithmetic and precedence", () => {
    expect(evaluateExpression("1 + 2 * 3", ctx)).toBe(7)
    expect(evaluateExpression("(1 + 2) * 3", ctx)).toBe(9)
  })

  it("+ concatenates when not both numbers", () => {
    expect(evaluateExpression("inputs.s + '!'", ctx)).toBe("hi!")
    expect(evaluateExpression("'n=' + inputs.a", ctx)).toBe("n=1")
  })

  it("division or modulo by zero → undefined", () => {
    expect(evaluateExpression("1 / 0", ctx)).toBeUndefined()
    expect(evaluateExpression("1 % 0", ctx)).toBeUndefined()
  })

  it("unary operators", () => {
    expect(evaluateExpression("!inputs.missing", ctx)).toBe(true)
    expect(evaluateExpression("-inputs.a", ctx)).toBe(-1)
  })

  it("index and member access", () => {
    expect(evaluateExpression("inputs.arr[0]", ctx)).toBe(10)
    expect(evaluateExpression("inputs.arr[inputs.a]", ctx)).toBe(20)
    expect(evaluateExpression('inputs.map["k"]', ctx)).toBe(5)
  })

  it("literals and keywords", () => {
    expect(evaluateExpression("true", ctx)).toBe(true)
    expect(evaluateExpression("false", ctx)).toBe(false)
    expect(evaluateExpression("null", ctx)).toBe(null)
    expect(evaluateExpression("undefined", ctx)).toBeUndefined()
    expect(evaluateExpression("1e3", ctx)).toBe(1000)
  })

  it("unknown identifier → undefined", () => {
    expect(evaluateExpression("nope", ctx)).toBeUndefined()
  })
})

describe("evaluateExpression — never throws", () => {
  it("trailing input → undefined", () => {
    expect(evaluateExpression("1 +", {})).toBeUndefined()
    expect(evaluateExpression("1 2", {})).toBeUndefined()
  })

  it("garbage → undefined", () => {
    expect(evaluateExpression("@#$", {})).toBeUndefined()
    expect(evaluateExpression("(1", {})).toBeUndefined()
  })
})

describe("evaluateValue", () => {
  it("walks nested strings in objects and arrays", () => {
    const ctx = { inputs: { x: "X", n: 3 } }
    expect(
      evaluateValue(
        { label: "{{ inputs.x }}", nested: { n: "{{ inputs.n }}" }, list: ["{{ inputs.x }}"] },
        ctx,
      ),
    ).toEqual({ label: "X", nested: { n: 3 }, list: ["X"] })
  })

  it("preserves an embedded sub-tree node as-is", () => {
    const ctx = { inputs: { summary: "Reading sources…" } }
    const result = evaluateValue(
      {
        items: [
          { label: "Overview", node: { type: "text", props: { value: "{{ inputs.summary }}" } } },
        ],
      },
      ctx,
    ) as any
    // The node is still a component node; its prop resolved.
    expect(result.items[0].node.type).toBe("text")
    expect(result.items[0].node.props.value).toBe("Reading sources…")
  })
})
