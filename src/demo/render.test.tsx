import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import {
  HxlRenderer,
  TileWidgetRenderer,
  createDefaultHxlRegistry,
  createDefaultTileRegistry,
  type TileWidgetBundle,
} from "../lib"
import { fixtures } from "./fixtures"
import clientProfileCard from "./data/clientProfileCard.json"
import clientProfileAttrs from "./data/clientProfileCard.attrs.json"
import opportunityCard from "./data/opportunityCard.json"
import opportunityAttrs from "./data/opportunityCard.attrs.json"
import accountUpdateConfirm from "./data/accountUpdateConfirm.json"
import accountUpdateConfirmAttrs from "./data/accountUpdateConfirm.attrs.json"

const tileRegistry = createDefaultTileRegistry()
const hxlRegistry = createDefaultHxlRegistry()

describe("TileWidgetRenderer — real gallery widgets", () => {
  const attrs = (clientProfileAttrs as any).attributes

  const html = renderToStaticMarkup(
    <TileWidgetRenderer
      widget={clientProfileCard as unknown as TileWidgetBundle}
      attrs={attrs}
      registry={tileRegistry}
    />,
  )

  it("renders non-empty markup", () => {
    expect(html.length).toBeGreaterThan(500)
  })

  it("binds $attrs into the header", () => {
    expect(html).toContain("Jaskirat Rangi")
    expect(html).toContain("High Net Worth")
    expect(html).toContain("JR") // avatar initials
  })

  it("expands meta.forEach over goals", () => {
    expect(html).toContain("Retirement Fund")
    expect(html).toContain("Annual Family Vacation")
  })

  it("renders markdown bold from advisorSnapshot", () => {
    expect(html).toContain("<strong>")
  })

  it("formats currency in the accounts table", () => {
    // balance 1040000 → $1,040,000
    expect(html).toContain("$1,040,000")
  })

  it("hides sections gated by absent meta.if flags", () => {
    // showAllocation / showRecentChanges are absent → those headers must not appear
    expect(html).not.toContain("ASSET ALLOCATION")
    expect(html).not.toContain("RECENT CHANGES")
  })

  it("leaves no unknown tiles", () => {
    expect(html).not.toContain("Unknown tile")
  })

  it("renders the opportunity card without unknowns", () => {
    const oppHtml = renderToStaticMarkup(
      <TileWidgetRenderer
        widget={opportunityCard as unknown as TileWidgetBundle}
        attrs={(opportunityAttrs as any).attributes}
        registry={tileRegistry}
      />,
    )
    expect(oppHtml.length).toBeGreaterThan(500)
    expect(oppHtml).not.toContain("Unknown tile")
  })

  it("renders the account-update-confirm input tiles without unknowns", () => {
    const html = renderToStaticMarkup(
      <TileWidgetRenderer
        widget={accountUpdateConfirm as unknown as TileWidgetBundle}
        attrs={(accountUpdateConfirmAttrs as any).attributes}
        registry={tileRegistry}
      />,
    )
    expect(html).not.toContain("Unknown tile")
    // every input tile type is present and seeded from bound $attrs data
    expect(html).toContain("Acme Corporation") // header ({!$attrs.accountName})
    expect(html).toContain("Account Owner") // tile/select label
    expect(html).toContain('value="(415) 555-9876"') // tile/textField
    expect(html).toContain('type="number"') // tile/numberField
    expect(html).toContain('role="radiogroup"') // tile/radio
    expect(html).toContain('role="switch"') // tile/switch
    expect(html).toContain("<textarea") // tile/textarea
    expect(html).toContain('role="separator"') // tile/separator
    // the Confirm/Cancel action buttons are enabled (not display-only):
    // both carry actions.click, so no button renders the `disabled` attribute.
    expect(html).toContain("Confirm Update")
    expect(html).toContain("Cancel")
    expect(html).not.toContain("disabled")
  })
})

describe("HxlRenderer — spec.md fixtures", () => {
  it("renders every fixture to non-empty markup", () => {
    for (const f of fixtures) {
      const html = renderToStaticMarkup(
        <HxlRenderer experience={f.experience} inputs={f.inputs} registry={hxlRegistry} />,
      )
      expect(html.length).toBeGreaterThan(20)
    }
  })

  it("resolves a binding change (found 0 → 7)", () => {
    const exp = fixtures[0].experience
    const a = renderToStaticMarkup(
      <HxlRenderer experience={exp} inputs={{ status: "idle", found: 0 }} registry={hxlRegistry} />,
    )
    const b = renderToStaticMarkup(
      <HxlRenderer experience={exp} inputs={{ status: "idle", found: 7 }} registry={hxlRegistry} />,
    )
    expect(a).toContain(">0<")
    expect(b).toContain(">7<")
  })
})
