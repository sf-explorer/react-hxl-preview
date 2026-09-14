import { useState } from "react"
import type { CSSProperties } from "react"
import type { HxlComponentNode, HxlComponentType } from "./types"
import { useHxlContext } from "./context"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return value == null ? "" : String(value)
}

function gapToCss(gap: unknown): string {
  switch (gap) {
    case "none":
      return "0"
    case "tight":
      return "0.375rem"
    case "wide":
      return "1.25rem"
    default:
      if (typeof gap === "number" && Number.isFinite(gap)) {
        return `${gap * 0.25}rem`
      }
      return "0.75rem"
  }
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

// ---------------------------------------------------------------------------
// stack — flex container
// ---------------------------------------------------------------------------

const Stack: HxlComponentType = ({ props, children }) => {
  const direction = props.direction === "row" ? "row" : "column"
  const style: CSSProperties = {
    display: "flex",
    flexDirection: direction,
    gap: gapToCss(props.gap),
  }
  if (typeof props.align === "string" && ALIGN[props.align]) {
    style.alignItems = ALIGN[props.align]
  }
  if (typeof props.justify === "string" && JUSTIFY[props.justify]) {
    style.justifyContent = JUSTIFY[props.justify]
  }
  return (
    <div className="hxl-stack" style={style}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// card — bordered surface
// ---------------------------------------------------------------------------

const Card: HxlComponentType = ({ props, children }) => {
  const accent = props.variant === "accent"
  const title = props.title
  return (
    <div className={`hxl-card${accent ? " hxl-card--accent" : ""}`}>
      {title != null && title !== "" && (
        <div className="hxl-card-title">{str(title)}</div>
      )}
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// text
// ---------------------------------------------------------------------------

const TEXT_VARIANTS = new Set(["heading", "body", "muted", "code"])

const Text: HxlComponentType = ({ props }) => {
  const variant =
    typeof props.variant === "string" && TEXT_VARIANTS.has(props.variant)
      ? props.variant
      : "body"
  return <p className={`hxl-text hxl-text--${variant}`}>{str(props.value)}</p>
}

// ---------------------------------------------------------------------------
// field — labelled value
// ---------------------------------------------------------------------------

const Field: HxlComponentType = ({ props }) => {
  const label = props.label
  const value = props.value == null ? "—" : String(props.value)
  return (
    <div className="hxl-field">
      {label != null && label !== "" && (
        <span className="hxl-field-label">{str(label)}</span>
      )}
      <span className="hxl-field-value">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// separator
// ---------------------------------------------------------------------------

const Separator: HxlComponentType = ({ props }) => {
  const orientation =
    props.orientation === "vertical" ? "vertical" : "horizontal"
  return (
    <div
      className="hxl-separator"
      role="separator"
      aria-orientation={orientation}
      data-orientation={orientation}
    />
  )
}

// ---------------------------------------------------------------------------
// button — display-only preview
// ---------------------------------------------------------------------------

const Button: HxlComponentType = ({ props, children }) => {
  const primary = props.variant === "primary"
  const label = props.label != null && props.label !== "" ? str(props.label) : children
  return (
    <button
      type="button"
      className={`hxl-btn ${primary ? "hxl-btn--primary" : "hxl-btn--ghost"}`}
      disabled
      aria-disabled="true"
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------

interface CompositeItem {
  label: string
  node: HxlComponentNode
}

function asItems(value: unknown): CompositeItem[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (it): it is CompositeItem =>
      it != null && typeof it === "object" && "node" in it,
  )
}

const Tabs: HxlComponentType = ({ props }) => {
  const { renderNodes } = useHxlContext()
  const items = asItems(props.items)
  const initial =
    typeof props.value === "string" ? props.value : items[0]?.label
  const [active, setActive] = useState<string | undefined>(initial)

  if (items.length === 0) return null

  const activeItem = items.find((it) => it.label === active) ?? items[0]

  return (
    <div className="hxl-tabs">
      <div className="hxl-tabs-list" role="tablist">
        {items.map((item, i) => {
          const selected = item.label === activeItem.label
          return (
            <button
              key={i}
              type="button"
              role="tab"
              className="hxl-tabs-trigger"
              data-state={selected ? "active" : "inactive"}
              aria-selected={selected}
              onClick={() => setActive(item.label)}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      <div className="hxl-tabs-content" role="tabpanel">
        {renderNodes([activeItem.node])}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// accordion (type: multiple)
// ---------------------------------------------------------------------------

const Chevron = () => (
  <svg
    className="hxl-accordion-chevron"
    width="12"
    height="12"
    viewBox="0 0 12 12"
    aria-hidden="true"
  >
    <path
      d="M2.5 4.5L6 8l3.5-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const Accordion: HxlComponentType = ({ props }) => {
  const { renderNodes } = useHxlContext()
  const items = asItems(props.items)
  const [open, setOpen] = useState<Set<number>>(new Set())

  if (items.length === 0) return null

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <div className="hxl-accordion">
      {items.map((item, i) => {
        const isOpen = open.has(i)
        const state = isOpen ? "open" : "closed"
        return (
          <div key={i} className="hxl-accordion-item" data-state={state}>
            <button
              type="button"
              className="hxl-accordion-trigger"
              data-state={state}
              aria-expanded={isOpen}
              onClick={() => toggle(i)}
            >
              <span>{item.label}</span>
              <Chevron />
            </button>
            {isOpen && (
              <div className="hxl-accordion-content" data-state={state}>
                <div className="hxl-accordion-content-inner">
                  {renderNodes([item.node])}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const defaultComponents: Record<string, HxlComponentType> = {
  stack: Stack,
  card: Card,
  text: Text,
  field: Field,
  separator: Separator,
  button: Button,
  tabs: Tabs,
  accordion: Accordion,
}
