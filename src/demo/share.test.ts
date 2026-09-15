import { describe, it, expect } from "vitest"
import { buildShareUrl, toCompactBundle } from "./share"
import type { TileWidgetBundle } from "../lib"
import actionPlan from "../../force-app/main/default/uiWidgets/actionPlan/actionPlan.json"
import actionPlanAttrs from "./data/actionPlan.attrs.json"

const widget = actionPlan as unknown as TileWidgetBundle
const attrs = (actionPlanAttrs as any).attributes

// Decode with web-standard APIs (no node:zlib) so the test needs no @types/node.
async function decodeShareUrl(url: string): Promise<unknown> {
  const share = new URL(url).searchParams.get("share")!
  const bin = atob(share.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  const ds = new DecompressionStream("deflate-raw")
  const buf = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(ds)).text()
  return JSON.parse(buf)
}

describe("share URL — headlessexperiencelayer.com format", () => {
  it("compacts the bundle: short keys, unwrapped tree, attrs as a provider", () => {
    const compact = toCompactBundle(widget, attrs)
    expect(compact.n).toBe(widget.title)
    expect(compact.l).toBe(widget.title)
    expect(compact.i).toBe("activity") // first tile/icon in the tree
    // tile/widget root is unwrapped — its children sit directly under f.c.
    expect(compact.f.c[0].d).toBe("tile/container")
    expect(compact.f.dp).toEqual([{ ek: "$attrs", v: attrs, d: "current-user" }])
  })

  // Matches the headlessexperiencelayer.com export: full `definition`/`attributes`
  // keys survive ONLY inside attribute values (button action descriptors), because
  // neither encoder recurses into attribute values.
  it("leaves action descriptors inside attributes verbatim", () => {
    const compact = toCompactBundle(widget, attrs)
    const fullDefs: string[] = []
    const clicks: unknown[] = []
    JSON.stringify(compact, (key, val) => {
      if (key === "definition") fullDefs.push(val)
      if (key === "click") clicks.push(val)
      return val
    })
    // Two buttons (Cancel/Confirm) each carry a click action descriptor.
    expect(clicks).toEqual([
      [{ definition: "planCancel", attributes: {}, inputs: "none" }],
      [{ definition: "planConfirm", attributes: {}, inputs: "auto" }],
    ])
    // Every surviving full `definition` is an action descriptor, never a node.
    expect(fullDefs).toEqual(["planCancel", "planConfirm"])
  })

  it("round-trips through deflate-raw + base64url back to the compact bundle", async () => {
    const url = await buildShareUrl(widget, attrs)
    expect(url.startsWith("https://www.headlessexperiencelayer.com/?share=")).toBe(true)
    expect(url.endsWith("#widget/detail-views")).toBe(true)
    expect(await decodeShareUrl(url)).toEqual(toCompactBundle(widget, attrs))
  })
})
