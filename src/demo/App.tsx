import { useEffect, useMemo, useRef, useState } from "react"
import {
  HxlSurface,
  TileWidgetRenderer,
  createDefaultHxlRegistry,
  createDefaultTileRegistry,
  type TileWidgetBundle,
} from "../lib"
import { fixtures } from "./fixtures"

import clientProfileCard from "./data/clientProfileCard.json"
import clientProfileAttrs from "./data/clientProfileCard.attrs.json"
import opportunityCard from "./data/opportunityCard.json"
import opportunityAttrs from "./data/opportunityCard.attrs.json"

// Build registries once — they are lookup tables, not per-frame state.
const hxlRegistry = createDefaultHxlRegistry()
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
]

type Mode = "tile" | "hxl"

export function App() {
  const [mode, setMode] = useState<Mode>("tile")

  return (
    <div className="demo">
      <header className="demo-header">
        <h1>React HXL Viewer</h1>
        <p>
          Preview a declarative HXL experience from a config plus JSON data.
          Same config + same data → same UI.
        </p>
        <div className="demo-modes">
          <button
            type="button"
            className={mode === "tile" ? "active" : ""}
            onClick={() => setMode("tile")}
          >
            Salesforce widget (tile/*)
          </button>
          <button
            type="button"
            className={mode === "hxl" ? "active" : ""}
            onClick={() => setMode("hxl")}
          >
            Spec.md dialect
          </button>
        </div>
      </header>

      {mode === "tile" ? <TilePlayground /> : <HxlPlayground />}
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
  const fixture = tileFixtures[index]
  const attrs = useEditableJson(fixture.attrs)

  function select(i: number) {
    setIndex(i)
    attrs.reset(tileFixtures[i].attrs)
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
      </div>

      <div className="demo-grid">
        <section className="demo-pane">
          <details className="demo-config">
            <summary>
              <h2>widget config</h2>
              <span className="demo-hint">read-only — the .uiwidget JSON</span>
            </summary>
            <pre className="demo-code demo-code--config">
              {JSON.stringify(fixture.widget, null, 2)}
            </pre>
          </details>

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
        </section>

        <section className="demo-pane">
          <div className="demo-pane-header">
            <h2>preview</h2>
            <span className="demo-hint">{fixture.widget.title}</span>
          </div>
          <div className="demo-preview">
            <TileWidgetRenderer
              widget={fixture.widget}
              attrs={attrs.value}
              registry={tileRegistry}
            />
          </div>
        </section>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Spec.md dialect playground — the from-scratch { type, props, {{ }} } engine.
// ---------------------------------------------------------------------------

function HxlPlayground() {
  const [index, setIndex] = useState(0)
  const fixture = fixtures[index]
  const inputs = useEditableJson(fixture.inputs)

  function select(i: number) {
    setIndex(i)
    inputs.reset(fixtures[i].inputs)
  }

  return (
    <>
      <div className="demo-toolbar">
        {fixtures.map((f, i) => (
          <button
            key={f.name}
            type="button"
            className={i === index ? "active" : ""}
            onClick={() => select(i)}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className="demo-grid">
        <section className="demo-pane">
          <div className="demo-pane-header">
            <h2>experience</h2>
            <span className="demo-hint">read-only</span>
          </div>
          <pre className="demo-code">{JSON.stringify(fixture.experience, null, 2)}</pre>

          <div className="demo-pane-header">
            <h2>inputs</h2>
            <span className="demo-hint">editable</span>
          </div>
          <textarea
            className={`demo-inputs${inputs.error ? " has-error" : ""}`}
            value={inputs.text}
            spellCheck={false}
            onChange={(e) => inputs.setText(e.target.value)}
          />
          {inputs.error && <p className="demo-error">Invalid JSON: {inputs.error}</p>}
        </section>

        <section className="demo-pane">
          <div className="demo-pane-header">
            <h2>preview</h2>
          </div>
          <div className="demo-preview">
            <HxlSurface
              agentName="preview-agent"
              experience={fixture.experience}
              inputs={inputs.value}
              registry={hxlRegistry}
            />
          </div>
        </section>
      </div>
    </>
  )
}
