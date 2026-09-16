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

## Edit with AI (host-agnostic)

The playground can rewrite a widget from a plain-English instruction ("add a red
'High priority' badge next to the title"). It runs an **agentic loop** —
propose → validate → self-correct — behind a **pluggable backend**, so it drops
into any host:

```tsx
import { editWidget, lintWidgetBundle, isTileAiAvailable, createTileAiClient } from "@sf-explorer/react-hxl-viewer"
import type { AiClient } from "@sf-explorer/react-hxl-viewer"

// 1. Provide a backend. Any object with `complete({prompt, system})` works.
const client: AiClient = createTileAiClient() // Page Host "Tile AI" proxy adapter

// 2. Edit. The loop lints each reply against the live tile/* catalog and feeds
//    precise errors back to the model until it returns a valid bundle.
const { widget, attrs, summary, iterations } = await editWidget({
  client,
  widget,          // current .uiwidget bundle
  attrs,           // current $attrs data
  instruction: "add a Notes textarea and include it in the confirm payload",
})
```

- **`AiClient`** is the only integration point — the loop knows nothing about
  which provider/proxy is behind it. Ship a mock in tests, a direct call in
  prod, or the bundled `createTileAiClient` (async submit + poll against a host
  proxy; `baseUrl` and token resolvers are all configurable).
- **`createTileAiClient`** targets the Page Host *Tile AI* service, reading the
  `window.__UPLOAD_ID__` / `window.__PROXY_TOKEN__` globals it injects.
  `isTileAiAvailable()` reports whether those are present.
- **`lintWidgetBundle`** is the standalone in-browser linter (the analog of the
  hxl-widget-build skill's `lint-widget.py`): known definitions only, binding
  and `meta` sanity, typed/enum attribute checks. It's what makes the loop's
  self-correction reliable.

In the playground the panel appears above the config; it activates when a
backend is detected. To wire your own outside the Page Host, set
`window.__HXL_AI_CLIENT__` to any `AiClient`.

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
| **Ranked Table (generic)** | A **caller-driven ranked/prioritized table**: title, badges, a summary callout, a `columns[]` + `rows[].cells[]` table, per-item highlights and a CTA — all supplied by the agent. The read-only sibling of Action Plan; it renders one card for opportunity prioritization, portfolio analysis, lead triage, weekly replanning, and more. |
| **Next Steps (generic)** | A **caller-driven list of proposed next steps / next best actions**: title, badges, a summary callout, and an ordered `steps[]` — each step an action-first title with a detail, a rationale, an optional priority chip, an icon, a supporting meta line and an optional link — all supplied by the agent. Renders meeting follow-ups, deal action plans, onboarding checklists, service resolution paths, and advisor next-best-actions. |

A further set of gallery-preview cards (French insurance + wealth context — *Leads du
jour*, *Plan de journée*, *Brief de réunion*, *Santé de l'affaire*, *Contrat
d'assurance*, and others) also ship under `force-app/main/default/uiWidgets/` and
appear in the playground toolbar.

## Salesforce widgets (`force-app`)

Each gallery widget is a Salesforce **HXL custom UI widget** — seven metadata
pieces wired by ONE field name, the *binding anchor*, that must stay
byte-identical across four of them (Apex response field → payload CLT →
GenAiFunction output → wrapper renderer path `{!$attrs.outputValues.<anchor>…}`).
An Apex `@InvocableMethod` returns the payload; Agentforce/MCP renders it into
the `tile/*` tree.

The **Action Plan**, **Ranked Table** and **Next Steps** widgets are the *generic*
ones: `ActionPlanAction` (anchor `plan`), `RankedTableAction` (anchor `table`) and
`NextStepsAction` (anchor `nextSteps`) each take a single JSON `spec` — the agent
supplies the content — and *flatten / normalize* it into typed, data-bound items
so the widget stays pure UI. Call any of them with no `spec` to get a portable
demo. Because the shaping happens in Apex, the widget's binding surface is only
`forEach` + `meta.if <boolean>` — no operators or dynamic key access — so it
renders identically in the preview and in the live HXL runtime.

> **Why flatten instead of `tile/table`?** Apex `@InvocableVariable` can't emit a
> dynamic-keyed row (a `Map`), and a typed CLT can't feed arbitrary keys to a
> native `tile/table`. So the generic actions emit `columns[]` + `rows[].cells[]`
> in column order, and the widget renders the grid with plain `forEach`. The
> interactive `tile/table` (client-side sort/filter) remains available for cards
> whose columns are fixed at authoring time.

## UI Specialist agent — keep the UI in a dedicated agent

**Strategy: presentation is its own agent, not a skill bolted onto every task
agent.** The gallery widgets are "only the UI" — they render whatever a caller
hands them. The natural counterpart is a single, reusable **UI Specialist**
Agentforce agent whose *only* job is to turn structured data into the right card.
Task agents stay agentic — they reason about the *business* problem and, when
they have something worth showing, delegate the *rendering* to the UI Specialist.

```
 ┌─────────────────┐   "show these ranked"   ┌──────────────────────┐   spec (JSON)   ┌───────────────────┐
 │  Task agent      │ ───── data it holds ──► │  UI Specialist agent  │ ─────────────► │  Get Ranked Table  │
 │ (sales, service) │                         │  (presentation only)  │                │  (Apex action)     │
 └─────────────────┘                         └──────────────────────┘                └─────────┬─────────┘
        ▲                                                                                        │ flatten
        └──────────────────────────── rendered HXL card ◄──────────── rankedTableCard widget ◄──┘
```

**The agent supplies the input.** The UI Specialist doesn't fetch data — it
*receives* the records the calling agent already has, then decides the columns, the
ordering, the summary and the highlights, and builds the action's JSON `spec`
itself. The Apex action is generic; the *taste* (what to compare, what to
foreground) lives in the agent's instructions, not in hard-coded metadata.

**Why a dedicated agent (and not per-agent display code):**

- **Separation of concerns** — reasoning agents don't carry layout rules;
  presentation logic changes in one place.
- **Consistency** — every card in the org is composed by the same specialist, so
  ranked lists look and behave the same everywhere.
- **Reuse & scale** — one action/topic per card. Today the UI Specialist owns
  **Ranked Table** and **Next Steps**; adding *Client Profile*, *Opportunity*,
  *Action Plan*, … is a new action (Agent Script) or `GenAiPlugin` topic pointing
  at that card's action — no change to the task agents that call it.
- **Stays agentic** — the specialist *chooses* the card and *composes* the spec
  from context each time; it isn't a fixed template.

### Two ways the agent itself is authored

The same UI Specialist ships in **both** Agentforce authoring formats — keep the
one that matches how your org builds agents (they define the same agent, so
deploy one, not both):

- **Agent Script (code-first)** — `aiAuthoringBundles/UI_Specialist/UI_Specialist.agent`.
  A single presentation state exposing both rendering actions
  (`get_ranked_table` → `apex://RankedTableAction`, `get_next_steps` →
  `apex://NextStepsAction`); the LLM picks the card by intent. This is the
  version-controlled, deterministic path — no `GenAiFunction`/`GenAiPlugin`
  metadata needed. Publish with `sf agent publish authoring-bundle`.
- **Agent Builder (declarative)** — `genAiPlanners/UI_Specialist.genAiPlanner-meta.xml`
  owning the two `GenAiPlugin` topics, each wrapping a `GenAiFunction`. This is
  the Setup-UI path.

### What ships in `force-app` for the agent

| Piece | File | Role |
| --- | --- | --- |
| **Apex actions** | `classes/RankedTableAction.cls`, `classes/NextStepsAction.cls` | Generic `@InvocableMethod`s; each takes a JSON `spec` and returns its flattened payload (binding anchors `table` / `nextSteps`). |
| **GenAiFunctions** | `genAiFunctions/Get_Ranked_Table/`, `genAiFunctions/Get_Next_Steps/` | Register the actions for the Builder path; `spec` in, displayable payload out. |
| **Lightning types** | `lightningTypes/{rankedTableCard,nextStepsCard}{Agent,Result,OutputValues}/` | Agent (flat `$attrs`) + MCP wrapper CLTs; renderers bind each payload into its `@widget/c/…` widget. |
| **Topics** | `genAiPlugins/UI_Specialist_Ranked_Table.genAiPlugin-meta.xml`, `genAiPlugins/UI_Specialist_Next_Steps.genAiPlugin-meta.xml` | *When* to render each card and *how* to build its spec (the agent's instructions). |
| **Agent Script bundle** | `aiAuthoringBundles/UI_Specialist/UI_Specialist.agent` | The code-first UI Specialist — both actions in one state. |
| **Agent (planner)** | `genAiPlanners/UI_Specialist.genAiPlanner-meta.xml` | The declarative UI Specialist — owns the topics. Add one action/topic per card as the gallery grows. |
| **Permission sets** | `permissionsets/HXL_Ranked_Table.permissionset-meta.xml`, `permissionsets/HXL_Next_Steps.permissionset-meta.xml` | Grant the agent's running user access to the Apex actions. |

**Deploy & activate** (supporting metadata first, then the agent):

```bash
# 1. Deploy the stack (single-package deploy auto-resolves order)
sf project deploy start \
  --source-dir force-app/main/default \
  --target-org <ORG> --wait 30

# 2. Assign the action permissions to the agent's running user
sf org assign permset --name HXL_Ranked_Table --target-org <ORG>
sf org assign permset --name HXL_Next_Steps --target-org <ORG>

# 3a. Code-first path: publish + activate the Agent Script bundle
sf agent publish authoring-bundle --api-name UI_Specialist --target-org <ORG>
sf agent activate --api-name UI_Specialist --target-org <ORG>
```

For the **Builder path** instead, go to **Setup → Agentforce → Agents**,
attach the **UI Specialist** Employee Agent to the `UI_Specialist` planner, bind a
running user that holds both permission sets, and **activate** it. (The
Bot/running-user binding is org-specific, so it's finished in Setup rather than
committed here.) Other agents then reach the specialist as a sub-agent / action
to render their results.

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
