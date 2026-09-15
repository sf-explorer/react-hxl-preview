# @sf-explorer/react-hxl-viewer

A React viewer for **HXL** (Headless Experience Layer): a declarative UI engine
that renders a JSON component tree whose props bind to typed inputs through
`{{ expression }}` strings. Modelled on the Salesforce Headless Experience Layer.

Give it `{ experience, inputs }` and it paints. Change `inputs` and the same
tree re-evaluates. Same experience + same inputs → same UI.

**▶ [Live demo](https://sf-explorer.github.io/react-hxl-preview/)** — an
interactive playground of the real gallery widgets. Pick a widget, edit its
`$attrs` JSON, and watch it re-render. Published from `main` on every push
(see [Deploy](#deploy)).

## Install

```bash
npm install @sf-explorer/react-hxl-viewer
```

## Usage

```tsx
import {
  HxlRenderer,
  HxlSurface,
  createDefaultHxlRegistry,
} from "@sf-explorer/react-hxl-viewer"
import "@sf-explorer/react-hxl-viewer/styles.css"
import type { HxlExperience } from "@sf-explorer/react-hxl-viewer"

// Build once at startup — it's a lookup table, not per-frame state.
const registry = createDefaultHxlRegistry()

export function Preview({
  experience,
  inputs,
}: {
  experience: HxlExperience
  inputs: Record<string, unknown>
}) {
  return <HxlRenderer experience={experience} inputs={inputs} registry={registry} />
}
```

`HxlSurface` is the same thing wrapped in optional chrome (agent name + title).

## Architecture

Three separate layers (per `.sf/spec.md`):

| Layer | File | Role |
| --- | --- | --- |
| **Contract** | `src/lib/types.ts` | JSON tree + inputs. No UI framework. |
| **Evaluator** | `src/lib/expression.ts` | Resolve `{{ expr }}` against `{ inputs }`. Never throws. |
| **Renderer + registry** | `src/lib/renderer.tsx`, `registry.ts` | Walk the tree, look up `type`, pass evaluated props to a component. |

### Invariants

1. **Never throws from render.** Unknown `type` → a neutral placeholder; bad
   expression → `undefined` / empty string.
2. No function calls in expressions — it's a declaration, not a program.
3. Every prop is evaluated before the component sees it (nested objects/arrays
   included).
4. Sub-trees stored in `props.items[].node` survive evaluation and render via a
   re-entrant `renderNodes` (used by `tabs` / `accordion`).
5. Bindings resolve against `inputs.*` — the eval context is `{ inputs }`.
6. Default buttons are display-only (disabled).

### Expression language

Recursive descent. Precedence low→high: `||`, `&&`, `== !=`, `< <= > >=`,
`+ -`, `* / %`, unary `! -`, member/index access, parentheses. `+` adds numbers
else concatenates. Division/modulo by zero → `undefined`. Unknown identifier →
`undefined`. See `expression.test.ts` for the full behaviour.

## Default component catalog

`stack`, `card`, `text`, `field`, `separator`, `button` (display-only),
`tabs`, `accordion`. Register your own:

```tsx
const registry = createDefaultHxlRegistry()
registry.register("myChart", ({ props }) => <MyChart data={props.data} />)
```

Custom components that embed HXL sub-trees call `renderNodes` from
`useHxlContext()`.

## Salesforce UiWidgetBundle (`tile/*`) dialect

Real HXL payloads from Agentforce / MCP use the Salesforce `UiWidgetBundle`
shape — `definition` / `attributes` / `meta`, `{!$attrs.x}` bindings, and a
`tile/*` component vocabulary. That dialect ships alongside the spec.md engine:

```tsx
import { TileWidgetRenderer, createDefaultTileRegistry } from "@sf-explorer/react-hxl-viewer"
import "@sf-explorer/react-hxl-viewer/styles.css"
import widget from "./clientProfileCard.json" // the .uiwidget JSON body
import sample from "./sample-attrs.json"

const registry = createDefaultTileRegistry()

<TileWidgetRenderer widget={widget} attrs={sample.attributes} registry={registry} />
```

- **Bindings** `{! expr }` share the same grammar as `{{ }}` — identifiers
  resolve on the scope root (`$attrs`, plus `forItem`/`forIndex` loop vars).
- **`meta.forEach` / `forItem` / `forIndex`** iterate an array, pushing each
  element onto a child scope; **`meta.if`** omits a node on a falsy condition.
- **Components:** `tile/widget`, `tile/container`, `tile/column`, `tile/row`,
  `tile/text`, `tile/avatar`, `tile/badge`, `tile/icon`, `tile/progress`,
  `tile/markdown`, `tile/link`, `tile/table` (client-side sort / filter /
  pagination, typed columns), `tile/spacer`, `tile/separator`, `tile/callout`.
- **Inputs (interactive):** `tile/select`, `tile/textField`, `tile/numberField`,
  `tile/radio`, `tile/checkbox`, `tile/switch`, `tile/textarea`. Each is stateful
  and writes its live value into a shared store keyed by its `id`.
- **`tile/button`** is display-only *unless* it declares `actions.click`. A
  button with actions is clickable: on click it gathers a payload per action —
  `inputs: "auto"` snapshots every input value, `inputs: "none"` dispatches an
  empty payload, an array of ids gathers just those — and surfaces the dispatched
  action + payload as a toast. `TileWidgetRenderer` wraps its tree in a
  `TileInteractionProvider` so this works out of the box; `useTileInteraction`
  and `useField` are exported for custom input/action tiles. The
  **Account Update (inputs)** gallery fixture is the end-to-end demo.

The renderer is total here too: an unknown `definition` paints a neutral
placeholder. `src/demo/render.test.tsx` renders the real gallery widgets
end-to-end.

## Gallery widgets

The playground and tests render the deployable widgets under
`force-app/main/default/uiWidgets/` — the single source of truth, imported
directly (no demo-local copies):

| Widget | Shows |
| --- | --- |
| **Client Profile Card** | A wealth-client relationship hub: stats, goals, household, action items, cases. |
| **Opportunity Card** | A deal-review card with a derived readiness score and "what needs attention". |
| **Account Update (inputs)** | Every interactive input tile (`select` / `textField` / `numberField` / `radio` / `checkbox` / `switch` / `textarea`) plus Confirm/Cancel actions. |
| **Notify Teammates (multi-select)** | A per-row `switch` over a `meta.forEach` list, each with a data-bound id. |
| **Action Plan (generic)** | A **caller-driven editable grid**: the widget renders whatever `rows[].cells[]` it is given — each cell typed `readonly` / `select` / `text` / `switch` — and Confirm gathers the whole revised grid as one payload. |

## Salesforce widgets (`force-app`)

Each gallery widget is a Salesforce **HXL custom UI widget** — seven metadata
pieces wired by ONE field name, the *binding anchor*, that must stay
byte-identical across four of them (Apex response field → payload CLT →
GenAiFunction output → wrapper renderer path `{!$attrs.outputValues.<anchor>…}`).
An Apex `@InvocableMethod` returns the payload; Agentforce/MCP renders it into
the `tile/*` tree.

The **Action Plan** widget is the generic one: `ActionPlanAction` (anchor
`plan`) takes a single JSON `spec` describing columns + rows and *flattens* it
into typed, data-bound cells so the widget stays pure UI. Call it with no `spec`
to get a portable demo triage plan. Because the flattening happens in Apex, the
widget's binding surface is only `forEach` + `meta.if <boolean>` — no operators
or dynamic key access — so it renders identically in the preview and in the live
HXL runtime.

## Develop

```bash
npm install
npm run dev        # live playground: pick a widget, edit its $attrs JSON
npm test           # evaluator + render test suite
npm run build      # library build → dist/ (ESM + CJS + d.ts + styles.css)
npm run build:demo # static demo build → dist-demo/ (what GitHub Pages serves)
```

## Deploy

The demo is published to **GitHub Pages** on every push to `main` by
`.github/workflows/deploy-demo.yml` (test → `build:demo` → deploy). It's served
from the project sub-path `/react-hxl-preview/`, which `vite.config.ts` sets as
the build `base`. One-time setup: in the repo's **Settings → Pages**, set
**Source** to **GitHub Actions**.
