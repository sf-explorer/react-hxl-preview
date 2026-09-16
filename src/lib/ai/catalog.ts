/**
 * The `tile/*` component palette, distilled for the model.
 *
 * This is the machine-readable half of the hxl-widget-build skill: every
 * component the default registry renders, the attributes it actually reads, and
 * the enums it honours. It is derived from `../tile/components.tsx` and
 * `../tile/table.tsx` — keep it in lock-step when the renderer gains or drops an
 * attribute, the same way the skill's linter tracks the live validator.
 */

export interface TileAttrSpec {
  name: string
  /** Short description + accepted values. */
  doc: string
  /** Closed set of allowed values, if any (used by the validator). */
  enum?: string[]
  /** Expected primitive type, if constrained (used by the validator). */
  type?: "boolean" | "number"
}

export interface TileComponentSpec {
  definition: string
  doc: string
  /** Does this component take children? */
  container?: boolean
  attrs?: TileAttrSpec[]
}

const GAP = ["none", "xs", "sm", "md", "lg"]
const ALIGN = ["start", "end", "center", "stretch"]

export const TILE_CATALOG: TileComponentSpec[] = [
  {
    definition: "tile/widget",
    doc: "Root of every widget. Exactly one, at contentBody.widgetBody. Wraps the card.",
    container: true,
  },
  {
    definition: "tile/container",
    doc: "Bordered card surface. Set borderless:true to drop the border.",
    container: true,
    attrs: [{ name: "borderless", doc: "true | false", type: "boolean" }],
  },
  {
    definition: "tile/column",
    doc: "Vertical flex stack.",
    container: true,
    attrs: [
      { name: "gap", doc: GAP.join(" | "), enum: GAP },
      { name: "align", doc: ALIGN.join(" | "), enum: ALIGN },
      { name: "width", doc: "full | stretch", enum: ["full", "stretch"] },
    ],
  },
  {
    definition: "tile/row",
    doc: "Horizontal flex row.",
    container: true,
    attrs: [
      { name: "gap", doc: GAP.join(" | "), enum: GAP },
      { name: "align", doc: ALIGN.join(" | "), enum: ALIGN },
      {
        name: "justify",
        doc: "start | end | center | between",
        enum: ["start", "end", "center", "between"],
      },
      { name: "isWrapped", doc: "true | false — wrap onto multiple lines", type: "boolean" },
      { name: "width", doc: "full | stretch", enum: ["full", "stretch"] },
    ],
  },
  {
    definition: "tile/text",
    doc: "A run of text. Bind dynamic values with {!$attrs.field}.",
    attrs: [
      { name: "text", doc: "the string to show (literal or {!binding})" },
      { name: "variant", doc: "h2 | h3 | h6 | body | caption" },
      { name: "weight", doc: "bold | semibold | normal" },
      { name: "color", doc: "muted | default | e.g. a semantic color" },
    ],
  },
  {
    definition: "tile/markdown",
    doc: "Renders markdown from `source`.",
    attrs: [{ name: "source", doc: "markdown string (literal or {!binding})" }],
  },
  {
    definition: "tile/avatar",
    doc: "Round avatar. Shows initials, else an icon.",
    attrs: [
      { name: "initials", doc: "1-2 letters" },
      { name: "iconName", doc: "lucide icon slug, e.g. user" },
      { name: "size", doc: "sm | md | lg" },
      { name: "alt", doc: "accessible label" },
    ],
  },
  {
    definition: "tile/badge",
    doc: "Small status pill.",
    attrs: [
      { name: "label", doc: "text" },
      { name: "variant", doc: "default | success | warning | error | info" },
    ],
  },
  {
    definition: "tile/icon",
    doc: "A single icon.",
    attrs: [
      { name: "name", doc: "lucide icon slug, e.g. activity, check, user, calendar" },
      { name: "size", doc: "sm | md | lg", enum: ["sm", "md", "lg"] },
      { name: "color", doc: "default | a semantic color" },
      { name: "alt", doc: "accessible label" },
    ],
  },
  {
    definition: "tile/progress",
    doc: "Horizontal progress bar.",
    attrs: [
      { name: "value", doc: "0-100", type: "number" },
      { name: "label", doc: "optional label above the bar" },
      { name: "color", doc: "primary | success | warning | error" },
      { name: "size", doc: "sm | md | lg" },
    ],
  },
  {
    definition: "tile/link",
    doc: "Hyperlink; opens in a new tab when href is set.",
    attrs: [
      { name: "text", doc: "link text" },
      { name: "href", doc: "url" },
      { name: "variant", doc: "default | primary" },
    ],
  },
  {
    definition: "tile/button",
    doc:
      "Button. Display-only unless it declares actions.click: an array of " +
      '{ definition, attributes, inputs } where inputs is "auto" (gather every ' +
      'input value), "none", or an array of input ids.',
    attrs: [
      { name: "label", doc: "button text" },
      { name: "variant", doc: "primary | secondary | ghost" },
      { name: "iconName", doc: "optional lucide slug" },
      { name: "actions", doc: '{ "click": [ { "definition": "myAction", "inputs": "auto" } ] }' },
    ],
  },
  {
    definition: "tile/table",
    doc:
      "Data table. columns: [{key,header,align?,isSortable?,isFilterable?," +
      "columnType?}]; rows: [{...}]. columnType.type can be link|number.",
    attrs: [
      { name: "columns", doc: "array of column defs (see above)" },
      { name: "rows", doc: "array of row objects keyed by column.key" },
      { name: "caption", doc: "optional table caption" },
      { name: "appearance", doc: "striped" },
      { name: "isStickyHeader", doc: "true | false", type: "boolean" },
    ],
  },
  {
    definition: "tile/callout",
    doc: "Highlighted note box.",
    attrs: [
      {
        name: "variant",
        doc: "info | success | warning | error",
        enum: ["info", "success", "warning", "error"],
      },
      { name: "title", doc: "optional title" },
      { name: "description", doc: "body text" },
    ],
  },
  {
    definition: "tile/separator",
    doc: "A divider line.",
    attrs: [
      {
        name: "orientation",
        doc: "horizontal | vertical",
        enum: ["horizontal", "vertical"],
      },
    ],
  },
  {
    definition: "tile/spacer",
    doc: "Empty space.",
    attrs: [{ name: "size", doc: "none | xs | sm | md | lg | fill" }],
  },
  {
    definition: "tile/select",
    doc: "Dropdown input. Needs an id so a button can gather its value.",
    attrs: [
      { name: "id", doc: "unique input id" },
      { name: "label", doc: "field label" },
      { name: "value", doc: "current value" },
      { name: "options", doc: "array of { label, value }" },
    ],
  },
  {
    definition: "tile/textField",
    doc: "Single-line text input.",
    attrs: [
      { name: "id", doc: "unique input id" },
      { name: "label", doc: "field label" },
      { name: "value", doc: "current value" },
      { name: "placeholder", doc: "placeholder text" },
      { name: "type", doc: "text | email | tel | ..." },
    ],
  },
  {
    definition: "tile/numberField",
    doc: "Numeric input.",
    attrs: [
      { name: "id", doc: "unique input id" },
      { name: "label", doc: "field label" },
      { name: "value", doc: "current number", type: "number" },
      { name: "min", doc: "minimum", type: "number" },
      { name: "max", doc: "maximum", type: "number" },
      { name: "placeholder", doc: "placeholder text" },
    ],
  },
  {
    definition: "tile/textarea",
    doc: "Multi-line text input.",
    attrs: [
      { name: "id", doc: "unique input id" },
      { name: "label", doc: "field label" },
      { name: "value", doc: "current value" },
      { name: "placeholder", doc: "placeholder text" },
    ],
  },
  {
    definition: "tile/radio",
    doc: "Radio group.",
    attrs: [
      { name: "id", doc: "unique input id" },
      { name: "label", doc: "group label" },
      { name: "value", doc: "selected value" },
      { name: "options", doc: "array of { label, value }" },
    ],
  },
  {
    definition: "tile/checkbox",
    doc: "Single checkbox.",
    attrs: [
      { name: "id", doc: "unique input id" },
      { name: "label", doc: "checkbox label" },
      { name: "isChecked", doc: "true | false", type: "boolean" },
    ],
  },
  {
    definition: "tile/switch",
    doc: "Toggle switch.",
    attrs: [
      { name: "id", doc: "unique input id" },
      { name: "label", doc: "switch label" },
      { name: "isChecked", doc: "true | false", type: "boolean" },
    ],
  },
]

/** Fast lookup by definition name. */
export const TILE_SPEC_BY_DEFINITION: Record<string, TileComponentSpec> =
  Object.fromEntries(TILE_CATALOG.map((c) => [c.definition, c]))

/** Every known definition — the closed set the validator checks against. */
export const KNOWN_TILE_DEFINITIONS: string[] = TILE_CATALOG.map((c) => c.definition)

/** Render the catalog as a compact reference block for the system prompt. */
export function catalogReference(): string {
  return TILE_CATALOG.map((c) => {
    const head = `- ${c.definition}${c.container ? " (container)" : ""}: ${c.doc}`
    if (!c.attrs?.length) return head
    const attrs = c.attrs.map((a) => `    · ${a.name}: ${a.doc}`).join("\n")
    return `${head}\n${attrs}`
  }).join("\n")
}
