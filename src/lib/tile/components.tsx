import type { CSSProperties } from "react"
import type { TileComponentType } from "./types"
import { TileGlyph } from "./icons"
import { TileMarkdown } from "./markdown"
import { TileTable } from "./table"
import { useField, useTileInteraction } from "./interaction"

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

const BUTTON_VARIANT: Record<string, string> = {
  primary: "tile-btn--primary",
  secondary: "tile-btn--secondary",
}

const Button: TileComponentType = ({ attributes, children }) => {
  const { snapshot, dispatch } = useTileInteraction()
  const variantClass = BUTTON_VARIANT[str(attributes.variant)] ?? "tile-btn--ghost"
  const inner = (
    <>
      {attributes.iconName && <TileGlyph name={str(attributes.iconName)} size="sm" />}
      {attributes.label != null && attributes.label !== "" ? str(attributes.label) : children}
    </>
  )

  const clickActions = Array.isArray(attributes.actions?.click)
    ? (attributes.actions.click as any[])
    : null

  // No declared click actions → display-only (the base-renderer contract).
  // Capture the intended action content as a tooltip, as before.
  if (!clickActions || clickActions.length === 0) {
    const action = attributes.actions?.click?.[0]?.attributes?.content
    return (
      <button
        type="button"
        className={`tile-btn ${variantClass}`}
        disabled
        aria-disabled="true"
        title={typeof action === "string" ? action : undefined}
      >
        {inner}
      </button>
    )
  }

  // Gather the payload each action asks for at click time:
  //   "auto"  → every registered input value
  //   [ids]   → just those input ids
  //   "none"  → empty payload
  const onClick = () => {
    const events = clickActions.map((a) => {
      const gather = a?.inputs
      let payload: Record<string, unknown> = {}
      if (gather === "auto") {
        payload = snapshot()
      } else if (Array.isArray(gather)) {
        const snap = snapshot()
        for (const id of gather) payload[String(id)] = snap[String(id)]
      }
      return { action: str(a?.definition) || "action", payload }
    })
    dispatch(events)
  }

  return (
    <button type="button" className={`tile-btn ${variantClass}`} onClick={onClick}>
      {inner}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------

const Separator: TileComponentType = ({ attributes }) => {
  const vertical = attributes.orientation === "vertical"
  return (
    <div
      className={`tile-separator tile-separator--${vertical ? "vertical" : "horizontal"}`}
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
    />
  )
}

// ---------------------------------------------------------------------------
// Inputs — stateful; each writes its value into the shared store by `id` so a
// button's `inputs: "auto"` gather can read the live snapshot at click time.
// ---------------------------------------------------------------------------

function FieldLabel({ id, text }: { id?: string; text: unknown }) {
  if (text == null || text === "") return null
  return (
    <label className="tile-field-label" htmlFor={id}>
      {str(text)}
    </label>
  )
}

interface Option {
  label?: unknown
  value?: unknown
}

function options(v: unknown): Option[] {
  return Array.isArray(v) ? (v as Option[]) : []
}

const Select: TileComponentType = ({ attributes }) => {
  const id = str(attributes.id) || undefined
  const [value, setValue] = useField(id, str(attributes.value))
  return (
    <div className="tile-field">
      <FieldLabel id={id} text={attributes.label} />
      <select
        id={id}
        className="tile-input tile-select"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        {options(attributes.options).map((o, i) => (
          <option key={i} value={str(o.value)}>
            {str(o.label)}
          </option>
        ))}
      </select>
    </div>
  )
}

const TextField: TileComponentType = ({ attributes }) => {
  const id = str(attributes.id) || undefined
  const [value, setValue] = useField(id, str(attributes.value))
  return (
    <div className="tile-field">
      <FieldLabel id={id} text={attributes.label} />
      <input
        id={id}
        className="tile-input"
        type={str(attributes.type) || "text"}
        value={value}
        placeholder={str(attributes.placeholder) || undefined}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  )
}

const NumberField: TileComponentType = ({ attributes }) => {
  const id = str(attributes.id) || undefined
  const initial = typeof attributes.value === "number" ? attributes.value : ""
  const [value, setValue] = useField<number | "">(id, initial)
  return (
    <div className="tile-field">
      <FieldLabel id={id} text={attributes.label} />
      <input
        id={id}
        className="tile-input"
        type="number"
        value={value === "" ? "" : value}
        min={typeof attributes.min === "number" ? attributes.min : undefined}
        max={typeof attributes.max === "number" ? attributes.max : undefined}
        placeholder={str(attributes.placeholder) || undefined}
        onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </div>
  )
}

const Radio: TileComponentType = ({ attributes }) => {
  const name = str(attributes.id) || undefined
  const [value, setValue] = useField(name, str(attributes.value))
  return (
    <div className="tile-field">
      {attributes.label != null && attributes.label !== "" && (
        <span className="tile-field-label">{str(attributes.label)}</span>
      )}
      <div className="tile-radio-group" role="radiogroup" aria-label={str(attributes.label)}>
        {options(attributes.options).map((o, i) => {
          const v = str(o.value)
          return (
            <label className="tile-radio" key={i}>
              <input
                type="radio"
                name={name}
                value={v}
                checked={value === v}
                onChange={() => setValue(v)}
              />
              <span>{str(o.label)}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

const Checkbox: TileComponentType = ({ attributes }) => {
  const id = str(attributes.id) || undefined
  const [checked, setChecked] = useField(id, attributes.isChecked === true)
  return (
    <label className="tile-check" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
      />
      <span>{str(attributes.label)}</span>
    </label>
  )
}

const Switch: TileComponentType = ({ attributes }) => {
  const id = str(attributes.id) || undefined
  const [on, setOn] = useField(id, attributes.isChecked === true)
  return (
    <label className="tile-switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => setOn(e.target.checked)}
      />
      <span className="tile-switch-track" aria-hidden="true">
        <span className="tile-switch-thumb" />
      </span>
      {attributes.label != null && attributes.label !== "" && (
        <span className="tile-switch-label">{str(attributes.label)}</span>
      )}
    </label>
  )
}

const Textarea: TileComponentType = ({ attributes }) => {
  const id = str(attributes.id) || undefined
  const [value, setValue] = useField(id, str(attributes.value))
  return (
    <div className="tile-field">
      <FieldLabel id={id} text={attributes.label} />
      <textarea
        id={id}
        className="tile-input tile-textarea"
        value={value}
        rows={3}
        placeholder={str(attributes.placeholder) || undefined}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
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
  "tile/separator": Separator,
  "tile/select": Select,
  "tile/textField": TextField,
  "tile/numberField": NumberField,
  "tile/radio": Radio,
  "tile/checkbox": Checkbox,
  "tile/switch": Switch,
  "tile/textarea": Textarea,
}
