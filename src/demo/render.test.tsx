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
// Widget bundles are read from the deployable source of truth
// (force-app/main/default/uiWidgets/*), not a demo-local copy.
import clientProfileCard from "../../force-app/main/default/uiWidgets/clientProfileCard/clientProfileCard.json"
import clientProfileAttrs from "./data/clientProfileCard.attrs.json"
import opportunityCard from "../../force-app/main/default/uiWidgets/opportunityCard/opportunityCard.json"
import opportunityAttrs from "./data/opportunityCard.attrs.json"
import accountUpdateConfirm from "../../force-app/main/default/uiWidgets/accountUpdateConfirm/accountUpdateConfirm.json"
import accountUpdateConfirmAttrs from "./data/accountUpdateConfirm.attrs.json"
import multiSelectList from "../../force-app/main/default/uiWidgets/multiSelectList/multiSelectList.json"
import multiSelectListAttrs from "./data/multiSelectList.attrs.json"
import actionPlan from "../../force-app/main/default/uiWidgets/actionPlan/actionPlan.json"
import actionPlanAttrs from "./data/actionPlan.attrs.json"

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

  it("renders a per-row toggle over a meta.forEach list (multi-select)", () => {
    const html = renderToStaticMarkup(
      <TileWidgetRenderer
        widget={multiSelectList as unknown as TileWidgetBundle}
        attrs={(multiSelectListAttrs as any).attributes}
        registry={tileRegistry}
      />,
    )
    expect(html).not.toContain("Unknown tile")
    // one row per teammate, each label bound from $member
    expect(html).toContain("Sarah Johnson")
    expect(html).toContain("Priya Patel")
    // each row's switch gets a distinct data-bound id (id="notify_<id>")
    expect(html).toContain('id="notify_sarah"')
    expect(html).toContain('id="notify_marcus"')
    // four switches → four checkbox inputs seeded from $member.selected
    expect(html.match(/role="switch"/g)?.length).toBe(4)
    // the two selected members render as checked
    expect(html.match(/checked/g)?.length).toBe(2)
  })

  it("renders the action-plan triage widget (per-row selects + bound option lists)", () => {
    const html = renderToStaticMarkup(
      <TileWidgetRenderer
        widget={actionPlan as unknown as TileWidgetBundle}
        attrs={(actionPlanAttrs as any).attributes}
        registry={tileRegistry}
      />,
    )
    expect(html).not.toContain("Unknown tile")
    // six proposed actions → one row each
    expect(html).toContain("Réclamation sensible OPERS")
    expect(html).toContain("Formation interne RGPD")
    // per-row inputs with data-bound unique ids
    expect(html).toContain('id="owner_opers"')
    expect(html).toContain('id="due_mrp_rcpro"')
    expect(html).toContain('id="approve_formation_rgpd"')
    // three inputs per row (action select, owner select, due field) × 6 rows
    expect(html.match(/<select/g)?.length).toBe(12) // 2 selects × 6 rows
    // owner select options come from the shared {!$attrs.owners} binding
    expect(html).toContain("Vance Channel")
    expect(html).toContain("Tania Djama")
    // due textField seeded from the relative-date strings
    expect(html).toContain('value="Après retour"')
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
