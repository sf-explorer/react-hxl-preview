import { useEffect, useMemo, useRef, useState } from "react"
import {
  TileWidgetRenderer,
  createDefaultTileRegistry,
  type TileWidgetBundle,
} from "../lib"

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
import { buildShareUrl } from "./share"

// Build the registry once — it's a lookup table, not per-frame state.
const tileRegistry = createDefaultTileRegistry()

interface TileFixture {
  name: string
  widget: TileWidgetBundle
  attrs: Record<string, unknown>
}

const tileFixtures: TileFixture[] = [
  {
    name: "Client Profile Card",
    widget: clientProfileCard as unknown as TileWidgetBundle,
    attrs: (clientProfileAttrs as any).attributes,
  },
  {
    name: "Opportunity Card",
    widget: opportunityCard as unknown as TileWidgetBundle,
    attrs: (opportunityAttrs as any).attributes,
  },
  {
    name: "Account Update (inputs)",
    widget: accountUpdateConfirm as unknown as TileWidgetBundle,
    attrs: (accountUpdateConfirmAttrs as any).attributes,
  },
  {
    name: "Notify Teammates (multi-select)",
    widget: multiSelectList as unknown as TileWidgetBundle,
    attrs: (multiSelectListAttrs as any).attributes,
  },
  {
    name: "Action Plan (generic)",
    widget: actionPlan as unknown as TileWidgetBundle,
    attrs: (actionPlanAttrs as any).attributes,
  },
]

export function App() {
  return (
    <div className="demo">
      <header className="demo-header">
        <h1>React HXL Viewer</h1>
        <p>
          Preview a Salesforce UiWidgetBundle (tile/*) from a config plus JSON
          data. Same config + same data → same UI.
        </p>
      </header>

      <TilePlayground />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editable JSON hook — keeps the last valid parse so a typo doesn't blank out.
// ---------------------------------------------------------------------------

function useEditableJson(initial: Record<string, unknown>) {
  const [text, setText] = useState(() => JSON.stringify(initial, null, 2))
  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(text) as Record<string, unknown>, error: null as string | null }
    } catch (e) {
      return { value: null, error: (e as Error).message }
    }
  }, [text])
  const lastGood = useRef(initial)
  useEffect(() => {
    if (parsed.value) lastGood.current = parsed.value
  }, [parsed.value])
  return {
    text,
    setText,
    error: parsed.error,
    value: parsed.value ?? lastGood.current,
    reset: (next: Record<string, unknown>) => {
      setText(JSON.stringify(next, null, 2))
      lastGood.current = next
    },
  }
}

// ---------------------------------------------------------------------------
// Tile playground — renders the real Salesforce UiWidgetBundle widgets.
// ---------------------------------------------------------------------------

function TilePlayground() {
  const [index, setIndex] = useState(0)
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">("idle")
  const fixture = tileFixtures[index]
  const attrs = useEditableJson(fixture.attrs)

  function select(i: number) {
    setIndex(i)
    setShareState("idle")
    attrs.reset(tileFixtures[i].attrs)
  }

  // Build a headlessexperiencelayer.com link for the widget + current $attrs,
  // copy it to the clipboard, and open the public viewer in a new tab.
  async function share() {
    try {
      const url = await buildShareUrl(fixture.widget, attrs.value)
      await navigator.clipboard?.writeText(url)
      setShareState("copied")
      window.open(url, "_blank", "noopener")
      setTimeout(() => setShareState("idle"), 2000)
    } catch {
      setShareState("error")
    }
  }

  return (
    <>
      <div className="demo-toolbar">
        {tileFixtures.map((f, i) => (
          <button
            key={f.name}
            type="button"
            className={i === index ? "active" : ""}
            onClick={() => select(i)}
          >
            {f.name}
          </button>
        ))}
        <button
          type="button"
          className="demo-share"
          onClick={share}
          title="Copy a headlessexperiencelayer.com link and open it in a new tab"
        >
          {shareState === "copied"
            ? "Link copied ✓"
            : shareState === "error"
              ? "Share failed"
              : "Share ↗"}
        </button>
      </div>

      <details className="demo-config demo-config--top">
        <summary>
          <h2>config &amp; data</h2>
          <span className="demo-hint">widget JSON + editable $attrs</span>
        </summary>
        <div className="demo-config-body">
          <div className="demo-config-col">
            <div className="demo-pane-header">
              <h2>widget config</h2>
              <span className="demo-hint">read-only — the .uiwidget JSON</span>
            </div>
            <pre className="demo-code demo-code--config">
              {JSON.stringify(fixture.widget, null, 2)}
            </pre>
          </div>

          <div className="demo-config-col">
            <div className="demo-pane-header">
              <h2>$attrs data</h2>
              <span className="demo-hint">editable — try changing a value</span>
            </div>
            <textarea
              className={`demo-inputs${attrs.error ? " has-error" : ""}`}
              value={attrs.text}
              spellCheck={false}
              onChange={(e) => attrs.setText(e.target.value)}
            />
            {attrs.error && <p className="demo-error">Invalid JSON: {attrs.error}</p>}
          </div>
        </div>
      </details>

      <div className="demo-pane-header">
        <h2>preview</h2>
        <span className="demo-hint">{fixture.widget.title}</span>
      </div>
      <div className="demo-preview demo-preview--full">
        <TileWidgetRenderer
          widget={fixture.widget}
          attrs={attrs.value}
          registry={tileRegistry}
        />
      </div>
    </>
  )
}
