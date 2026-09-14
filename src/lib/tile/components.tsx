import type { CSSProperties } from "react"
import type { TileComponentType } from "./types"
import { TileGlyph } from "./icons"
import { TileMarkdown } from "./markdown"
import { TileTable } from "./table"

// ---------------------------------------------------------------------------
// Shared attribute → CSS mappings
// ---------------------------------------------------------------------------

const GAP: Record<string, string> = {
  none: "0",
  xs: "0.25rem",
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
}

const ALIGN: Record<string, string> = {
  start: "flex-start",
  end: "flex-end",
  center: "center",
  stretch: "stretch",
}

const JUSTIFY: Record<string, string> = {
  start: "flex-start",
  end: "flex-end",
  center: "center",
  between: "space-between",
}

function gap(v: unknown): string {
  return typeof v === "string" && GAP[v] !== undefined ? GAP[v] : GAP.md
}

function widthStyle(v: unknown, style: CSSProperties) {
  if (v === "full") style.width = "100%"
  else if (v === "stretch") style.flex = "1 1 auto"
}

function str(v: unknown): string {
  return v == null ? "" : String(v)
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const Widget: TileComponentType = ({ children }) => (
  <div className="tile-widget">{children}</div>
)

const Container: TileComponentType = ({ attributes, children }) => {
  const borderless = attributes.borderless === true
  return (
    <div className={`tile-container${borderless ? " tile-container--borderless" : ""}`}>
      {children}
    </div>
  )
}

const Column: TileComponentType = ({ attributes, children }) => {
  const style: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: gap(attributes.gap),
    alignItems: ALIGN[attributes.align] ?? undefined,
  }
  widthStyle(attributes.width, style)
  return (
    <div className="tile-column" style={style}>
      {children}
    </div>
  )
}

const Row: TileComponentType = ({ attributes, children }) => {
  const style: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    gap: gap(attributes.gap),
    alignItems: ALIGN[attributes.align] ?? undefined,
    justifyContent: JUSTIFY[attributes.justify] ?? undefined,
    flexWrap: attributes.isWrapped ? "wrap" : "nowrap",
  }
  widthStyle(attributes.width, style)
  return (
    <div className="tile-row" style={style}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const TEXT_TAGS: Record<string, keyof JSX.IntrinsicElements> = {
  h2: "h2",
  h6: "h6",
  body: "span",
  caption: "span",
}

const Text: TileComponentType = ({ attributes }) => {
  const variant = typeof attributes.variant === "string" ? attributes.variant : "body"
  const Tag = TEXT_TAGS[variant] ?? "span"
  const classes = [
    "tile-text",
    `tile-text--${variant}`,
    attributes.weight ? `tile-text--w-${attributes.weight}` : "",
    attributes.color ? `tile-text--c-${attributes.color}` : "",
  ]
    .filter(Boolean)
    .join(" ")
  return <Tag className={classes}>{str(attributes.text)}</Tag>
}

const Avatar: TileComponentType = ({ attributes }) => (
  <div
    className="tile-avatar"
    data-size={str(attributes.size) || "md"}
    role="img"
    aria-label={str(attributes.alt)}
  >
    {attributes.initials ? (
      <span>{str(attributes.initials)}</span>
    ) : (
      <TileGlyph name={str(attributes.iconName) || "user"} size="md" />
    )}
  </div>
)

const Badge: TileComponentType = ({ attributes }) => (
  <span className={`tile-badge tile-badge--${str(attributes.variant) || "default"}`}>
    {str(attributes.label)}
  </span>
)

const Icon: TileComponentType = ({ attributes }) => (
  <span className={`tile-icon tile-icon--${str(attributes.color) || "default"}`}>
    <TileGlyph
      name={str(attributes.name)}
      size={str(attributes.size) || "md"}
      title={str(attributes.alt) || undefined}
    />
  </span>
)

const Progress: TileComponentType = ({ attributes }) => {
  const raw = Number(attributes.value)
  const pct = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0
  const color = str(attributes.color) || "primary"
  return (
    <div className="tile-progress" data-size={str(attributes.size) || "md"}>
      {attributes.label != null && attributes.label !== "" && (
        <div className="tile-progress-head">
          <span>{str(attributes.label)}</span>
          <span className="tile-progress-pct">{pct}%</span>
        </div>
      )}
      <div
        className="tile-progress-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`tile-progress-fill tile-progress-fill--${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const Markdown: TileComponentType = ({ attributes }) => (
  <TileMarkdown source={attributes.source} />
)

const Link: TileComponentType = ({ attributes }) => {
  const href = str(attributes.href)
  return (
    <a
      className={`tile-link tile-link--${str(attributes.variant) || "default"}`}
      href={href || undefined}
      target={href ? "_blank" : undefined}
      rel={href ? "noreferrer" : undefined}
    >
      {str(attributes.text)}
    </a>
  )
}

const Button: TileComponentType = ({ attributes, children }) => {
  const primary = attributes.variant === "primary"
  // Display-only in preview; capture the intended action as a tooltip.
  const action = attributes.actions?.click?.[0]?.attributes?.content
  return (
    <button
      type="button"
      className={`tile-btn ${primary ? "tile-btn--primary" : "tile-btn--ghost"}`}
      disabled
      aria-disabled="true"
      title={typeof action === "string" ? action : undefined}
    >
      {attributes.iconName && <TileGlyph name={str(attributes.iconName)} size="sm" />}
      {attributes.label != null && attributes.label !== "" ? str(attributes.label) : children}
    </button>
  )
}

const Spacer: TileComponentType = ({ attributes }) => {
  if (attributes.size === "fill") return <div style={{ flex: "1 1 auto" }} />
  const size = typeof attributes.size === "string" ? GAP[attributes.size] : undefined
  return <div style={{ height: size ?? GAP.md, flexShrink: 0 }} />
}

const Callout: TileComponentType = ({ attributes }) => {
  const variant = str(attributes.variant) || "info"
  return (
    <div className={`tile-callout tile-callout--${variant}`} role="note">
      {attributes.title != null && attributes.title !== "" && (
        <div className="tile-callout-title">{str(attributes.title)}</div>
      )}
      {attributes.description != null && attributes.description !== "" && (
        <div className="tile-callout-body">{str(attributes.description)}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const defaultTileComponents: Record<string, TileComponentType> = {
  "tile/widget": Widget,
  "tile/container": Container,
  "tile/column": Column,
  "tile/row": Row,
  "tile/text": Text,
  "tile/avatar": Avatar,
  "tile/badge": Badge,
  "tile/icon": Icon,
  "tile/progress": Progress,
  "tile/markdown": Markdown,
  "tile/link": Link,
  "tile/table": TileTable,
  "tile/button": Button,
  "tile/spacer": Spacer,
  "tile/callout": Callout,
}
