import { describe, expect, it } from "vitest"
import { WIDGET_TOOLS, attrBindings, type AgentDraft } from "./tools"
import type { TileWidgetBundle } from "../tile/types"

const widget: TileWidgetBundle = {
  type: "lightning__agentforceWidget",
  title: "{!$attrs.title}",
  contentBody: {
    widgetBody: {
      definition: "tile/widget",
      children: [
        { definition: "tile/text", attributes: { text: "Owner: {!$attrs.owner.name}" } },
        {
          definition: "tile/text",
          attributes: { text: "{!$row.label}" },
          meta: { forEach: "{!$attrs.rows}", forItem: "$row" },
        },
      ],
    },
  },
}

const tool = (name: string) => WIDGET_TOOLS.find((t) => t.name === name)!

describe("attrBindings", () => {
  it("collects every $attrs path across attributes, text, meta and title", () => {
    expect(attrBindings(widget)).toEqual(["owner.name", "rows", "title"])
  })
  it("returns nothing for a widget with no bindings", () => {
    expect(attrBindings({ contentBody: { widgetBody: { definition: "tile/widget" } } })).toEqual([])
  })
})

describe("list_data_fields tool", () => {
  it("reports referenced fields and flags missing top-level keys", () => {
    const draft: AgentDraft = { widget, attrs: { title: "Hi" } }
    const out = JSON.parse(tool("list_data_fields").run({}, draft))
    expect(out.referenced).toEqual(["owner.name", "rows", "title"])
    // "title" is present; "owner" and "rows" are missing.
    expect(out.missing.sort()).toEqual(["owner", "rows"])
    expect(out.hasData).toEqual(["title"])
  })

  it("says nothing is needed when there are no bindings", () => {
    const draft: AgentDraft = {
      widget: { contentBody: { widgetBody: { definition: "tile/widget" } } },
      attrs: {},
    }
    expect(tool("list_data_fields").run({}, draft)).toContain("no $attrs bindings")
  })
})

describe("lint_widget tool", () => {
  const draft: AgentDraft = { widget, attrs: {} }

  it("steers a clean bundle toward set_widget instead of re-linting", () => {
    const out = tool("lint_widget").run({ widget }, draft)
    expect(out).toContain("no errors")
    expect(out).toContain("set_widget")
    expect(out).toContain("do NOT lint again")
  })

  it("returns the error list for an invalid bundle", () => {
    const bogus = { contentBody: { widgetBody: { definition: "tile/bogus" } } }
    const out = JSON.parse(tool("lint_widget").run({ widget: bogus }, draft))
    expect(out.errors.join(" ")).toContain("tile/bogus")
  })
})
