import { describe, expect, it } from "vitest"
import { lintWidgetBundle } from "./validate"

const valid = {
  type: "lightning__agentforceWidget",
  title: "Card",
  contentBody: {
    widgetBody: {
      definition: "tile/widget",
      children: [
        {
          definition: "tile/container",
          attributes: { borderless: false },
          children: [
            { definition: "tile/text", attributes: { text: "{!$attrs.name}", variant: "h2" } },
          ],
        },
      ],
    },
  },
}

describe("lintWidgetBundle", () => {
  it("passes a well-formed bundle", () => {
    const { errors } = lintWidgetBundle(valid)
    expect(errors).toEqual([])
  })

  it("errors when widgetBody is missing", () => {
    expect(lintWidgetBundle({ contentBody: {} }).errors).toContain(
      "widget.contentBody.widgetBody is missing",
    )
  })

  it("errors on an unknown tile definition", () => {
    const bad = {
      contentBody: { widgetBody: { definition: "tile/nope" } },
    }
    const { errors } = lintWidgetBundle(bad)
    expect(errors.some((e) => e.includes('unknown tile "tile/nope"'))).toBe(true)
  })

  it("errors when a boolean attribute is a string", () => {
    const bad = {
      contentBody: {
        widgetBody: {
          definition: "tile/widget",
          children: [{ definition: "tile/container", attributes: { borderless: "true" } }],
        },
      },
    }
    const { errors } = lintWidgetBundle(bad)
    expect(errors.some((e) => e.includes("borderless") && e.includes("boolean"))).toBe(true)
  })

  it("errors on an out-of-enum value", () => {
    const bad = {
      contentBody: {
        widgetBody: {
          definition: "tile/widget",
          children: [{ definition: "tile/row", attributes: { justify: "middle" } }],
        },
      },
    }
    const { errors } = lintWidgetBundle(bad)
    expect(errors.some((e) => e.includes("justify"))).toBe(true)
  })

  it("does not enum-check a value that is a binding", () => {
    const ok = {
      contentBody: {
        widgetBody: {
          definition: "tile/widget",
          children: [{ definition: "tile/row", attributes: { justify: "{!$attrs.justify}" } }],
        },
      },
    }
    expect(lintWidgetBundle(ok).errors).toEqual([])
  })

  it("errors when forEach is not a binding", () => {
    const bad = {
      contentBody: {
        widgetBody: {
          definition: "tile/widget",
          children: [
            { definition: "tile/container", meta: { forEach: "$attrs.rows", forItem: "$row" } },
          ],
        },
      },
    }
    const { errors } = lintWidgetBundle(bad)
    expect(errors.some((e) => e.includes("forEach"))).toBe(true)
  })
})
