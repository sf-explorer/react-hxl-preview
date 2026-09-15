import type { TileNode, TileWidgetBundle } from "../lib"

// The public HXL viewer at headlessexperiencelayer.com accepts a whole widget
// bundle inline in the URL: `?share=<base64url(deflate-raw(json))>` plus the
// `#widget/detail-views` route. The JSON is a *compacted* tile tree — short keys
// (`d`/`a`/`c` for definition/attributes/children) and the sample data inlined
// as named data providers instead of a separate `$attrs` file.

const SHARE_BASE = "https://www.headlessexperiencelayer.com/"
const SHARE_HASH = "#widget/detail-views"

/** A tile node in the compact shape the share link uses. */
export interface CompactNode {
  d: string
  a?: Record<string, unknown>
  c?: CompactNode[]
  meta?: TileNode["meta"]
}

/** The compacted bundle carried in `?share=`. */
export interface CompactBundle {
  n: string
  l: string
  i: string
  f: {
    dp: Array<{ ek: string; v: unknown; d: string }>
    c: CompactNode[]
  }
}

function compactNode(node: TileNode): CompactNode {
  const out: CompactNode = { d: node.definition }
  if (node.attributes && Object.keys(node.attributes).length) out.a = node.attributes
  if (node.meta && Object.keys(node.meta).length) out.meta = node.meta
  if (node.children?.length) out.c = node.children.map(compactNode)
  return out
}

// The header icon (`i`) — the first tile/icon in the tree, else a default.
function firstIcon(node: TileNode): string | undefined {
  if (node.definition === "tile/icon" && typeof node.attributes?.name === "string") {
    return node.attributes.name as string
  }
  for (const child of node.children ?? []) {
    const found = firstIcon(child)
    if (found) return found
  }
  return undefined
}

/** Transform a repo bundle + live `$attrs` into the share link's compact shape. */
export function toCompactBundle(
  widget: TileWidgetBundle,
  attrs: Record<string, unknown>,
): CompactBundle {
  const root = widget.contentBody.widgetBody
  // The repo wraps the tree in a `tile/widget` root; the share format puts the
  // tree directly under `f.c`, so unwrap it.
  const topNodes = root.definition === "tile/widget" ? root.children ?? [] : [root]
  const title = widget.title ?? "HXL widget"
  return {
    n: title,
    l: title,
    i: firstIcon(root) ?? "activity",
    f: {
      dp: [{ ek: "$attrs", v: attrs, d: "current-user" }],
      c: topNodes.map(compactNode),
    },
  }
}

function base64url(bytes: Uint8Array): string {
  let bin = ""
  // Loop rather than spread — String.fromCharCode(...huge) overflows the stack.
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function deflateRaw(input: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw")
  const buf = await new Response(new Blob([input as BlobPart]).stream().pipeThrough(cs)).arrayBuffer()
  return new Uint8Array(buf)
}

/** Build a headlessexperiencelayer.com share URL for the given widget + data. */
export async function buildShareUrl(
  widget: TileWidgetBundle,
  attrs: Record<string, unknown>,
): Promise<string> {
  const bundle = toCompactBundle(widget, attrs)
  const json = new TextEncoder().encode(JSON.stringify(bundle))
  const encoded = base64url(await deflateRaw(json))
  return `${SHARE_BASE}?share=${encoded}${SHARE_HASH}`
}
