import { useEffect, useMemo, useRef, useState } from "react"
import {
  TileWidgetRenderer,
  createDefaultTileRegistry,
  createTileAiClient,
  editWidget,
  runAgent,
  createWidget,
  isTileAiAvailable,
  type AiClient,
  type EditProgress,
  type AgentProgress,
  type RunAgentResult,
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
// Additional gallery cards (French insurance + wealth context), sourced from the
// same deployable uiWidgets bundles.
import clientRecordUpdateCard from "../../force-app/main/default/uiWidgets/clientRecordUpdateCard/clientRecordUpdateCard.json"
import clientRecordUpdateAttrs from "./data/clientRecordUpdateCard.attrs.json"
import dailyPlanCard from "../../force-app/main/default/uiWidgets/dailyPlanCard/dailyPlanCard.json"
import dailyPlanAttrs from "./data/dailyPlanCard.attrs.json"
import dealHealthCard from "../../force-app/main/default/uiWidgets/dealHealthCard/dealHealthCard.json"
import dealHealthAttrs from "./data/dealHealthCard.attrs.json"
import insurancePolicyCard from "../../force-app/main/default/uiWidgets/insurancePolicyCard/insurancePolicyCard.json"
import insurancePolicyAttrs from "./data/insurancePolicyCard.attrs.json"
import leadsTodayCard from "../../force-app/main/default/uiWidgets/leadsTodayCard/leadsTodayCard.json"
import leadsTodayAttrs from "./data/leadsTodayCard.attrs.json"
import meetingPrepCard from "../../force-app/main/default/uiWidgets/meetingPrepCard/meetingPrepCard.json"
import meetingPrepAttrs from "./data/meetingPrepCard.attrs.json"
import outreachBatchCard from "../../force-app/main/default/uiWidgets/outreachBatchCard/outreachBatchCard.json"
import outreachBatchAttrs from "./data/outreachBatchCard.attrs.json"
import performanceReviewCard from "../../force-app/main/default/uiWidgets/performanceReviewCard/performanceReviewCard.json"
import performanceReviewAttrs from "./data/performanceReviewCard.attrs.json"
import rankedTableCard from "../../force-app/main/default/uiWidgets/rankedTableCard/rankedTableCard.json"
import rankedTableAttrs from "./data/rankedTableCard.attrs.json"
import nextStepsCard from "../../force-app/main/default/uiWidgets/nextStepsCard/nextStepsCard.json"
import nextStepsAttrs from "./data/nextStepsCard.attrs.json"
import recordUpdateConfirmCard from "../../force-app/main/default/uiWidgets/recordUpdateConfirmCard/recordUpdateConfirmCard.json"
import recordUpdateConfirmAttrs from "./data/recordUpdateConfirmCard.attrs.json"
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
  {
    name: "Leads du jour",
    widget: leadsTodayCard as unknown as TileWidgetBundle,
    attrs: (leadsTodayAttrs as any).attributes,
  },
  {
    name: "Plan de journée",
    widget: dailyPlanCard as unknown as TileWidgetBundle,
    attrs: (dailyPlanAttrs as any).attributes,
  },
  {
    name: "Brief de réunion",
    widget: meetingPrepCard as unknown as TileWidgetBundle,
    attrs: (meetingPrepAttrs as any).attributes,
  },
  {
    name: "Santé de l'affaire",
    widget: dealHealthCard as unknown as TileWidgetBundle,
    attrs: (dealHealthAttrs as any).attributes,
  },
  {
    name: "Tableau priorisé",
    widget: rankedTableCard as unknown as TileWidgetBundle,
    attrs: (rankedTableAttrs as any).attributes,
  },
  {
    name: "Prochaines étapes",
    widget: nextStepsCard as unknown as TileWidgetBundle,
    attrs: (nextStepsAttrs as any).attributes,
  },
  {
    name: "Rapport d'envoi",
    widget: outreachBatchCard as unknown as TileWidgetBundle,
    attrs: (outreachBatchAttrs as any).attributes,
  },
  {
    name: "Revue de performance",
    widget: performanceReviewCard as unknown as TileWidgetBundle,
    attrs: (performanceReviewAttrs as any).attributes,
  },
  {
    name: "Contrat d'assurance",
    widget: insurancePolicyCard as unknown as TileWidgetBundle,
    attrs: (insurancePolicyAttrs as any).attributes,
  },
  {
    name: "Mise à jour de la fiche client",
    widget: clientRecordUpdateCard as unknown as TileWidgetBundle,
    attrs: (clientRecordUpdateAttrs as any).attributes,
  },
  {
    name: "Confirmer les mises à jour",
    widget: recordUpdateConfirmCard as unknown as TileWidgetBundle,
    attrs: (recordUpdateConfirmAttrs as any).attributes,
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
  // The widget tree is editable state too — the AI can restructure it, not just
  // change the data. It resets to the source bundle when the fixture switches.
  const [widget, setWidget] = useState<TileWidgetBundle>(fixture.widget)

  function select(i: number) {
    setIndex(i)
    setShareState("idle")
    setWidget(tileFixtures[i].widget)
    attrs.reset(tileFixtures[i].attrs)
  }

  function applyAiEdit(
    nextWidget: TileWidgetBundle,
    nextAttrs: Record<string, unknown>,
  ) {
    setWidget(nextWidget)
    attrs.reset(nextAttrs)
  }

  // Build a headlessexperiencelayer.com link for the widget + current $attrs,
  // copy it to the clipboard, and open the public viewer in a new tab.
  async function share() {
    try {
      const url = await buildShareUrl(widget, attrs.value)
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

      <AiEditPanel widget={widget} attrs={attrs.value} onApply={applyAiEdit} />

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
              {JSON.stringify(widget, null, 2)}
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
        <span className="demo-hint">{widget.title}</span>
      </div>
      <div className="demo-preview demo-preview--full">
        <TileWidgetRenderer
          widget={widget}
          attrs={attrs.value}
          registry={tileRegistry}
        />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// AI edit panel — describe a change, an agentic loop rewrites the widget + data.
// ---------------------------------------------------------------------------

/**
 * Resolve an AI backend without hard-wiring one host.
 *  1. `window.__HXL_AI_CLIENT__` — a host can inject a full AiClient (any
 *     provider/proxy/mock). This is the generic plug-in point.
 *  2. The Page Host "Tile AI" service, when its injected globals are present.
 *  3. Otherwise none — the panel explains how to enable it.
 */
function resolveAiClient(): AiClient | null {
  const injected = (window as unknown as { __HXL_AI_CLIENT__?: AiClient })
    .__HXL_AI_CLIENT__
  if (injected && typeof injected.complete === "function") return injected
  if (isTileAiAvailable()) return createTileAiClient()
  return null
}

// A progress line, tagged with a tone so the panel can render an icon + colour
// per step instead of one undifferentiated wall of text.
type StepTone =
  | "think"
  | "action"
  | "observe"
  | "commit"
  | "invalid"
  | "done"
  | "limit"

interface ProgressStep {
  tone: StepTone
  text: string
}

const STEP_ICON: Record<StepTone, string> = {
  think: "→",
  action: "●",
  observe: "↳",
  commit: "↻",
  invalid: "✗",
  done: "✓",
  limit: "⏸",
}

function describeEditProgress(e: EditProgress): ProgressStep {
  switch (e.phase) {
    case "request":
      return { tone: "think", text: `Attempt ${e.iteration}: asking the model…` }
    case "reply":
      return {
        tone: "observe",
        text: `Attempt ${e.iteration}: reply received (${e.text.length} chars)`,
      }
    case "invalid":
      return {
        tone: "invalid",
        text: `Attempt ${e.iteration} invalid — ${e.problems.join("; ")}`,
      }
    case "applied":
      return {
        tone: "done",
        text: `Valid on attempt ${e.iteration}${e.summary ? ` — ${e.summary}` : ""}${
          e.warnings.length ? ` ⚠ ${e.warnings.join("; ")}` : ""
        }`,
      }
  }
}

/**
 * Render one step of the tool-using (runAgent / createWidget) loop, or `null`
 * to skip it. We soften the loop's internal retries — a reply that names no tool
 * shows as "reading the reply…" rather than the raw `no such tool ""` error.
 */
function describeAgentProgress(e: AgentProgress): ProgressStep | null {
  switch (e.phase) {
    case "request":
      return { tone: "think", text: `Step ${e.iteration}: thinking…` }
    case "action":
      if (e.action.finish) {
        return {
          tone: "action",
          text: `Step ${e.iteration}: finishing${
            e.action.finish.summary ? ` — ${e.action.finish.summary}` : ""
          }`,
        }
      }
      // No tool named — the model didn't emit a valid action; the loop will nudge
      // it to retry. Show that as thinking, not a scary error.
      if (!e.action.tool) {
        return { tone: "think", text: `Step ${e.iteration}: reading the reply…` }
      }
      return {
        tone: "action",
        text: `Step ${e.iteration}: ${e.action.tool}${
          e.action.thought ? ` — ${e.action.thought}` : ""
        }`,
      }
    case "observation": {
      // The empty-tool observation is just the retry nudge for the case above.
      if (!e.tool) return null
      const first = e.observation.split("\n")[0]
      const clipped = first.length > 120 ? `${first.slice(0, 120)}…` : first
      return { tone: "observe", text: `${e.tool}: ${clipped}` }
    }
    case "commit":
      return {
        tone: "commit",
        text: `Preview updated${e.tool ? ` (${e.tool})` : ""}`,
      }
    case "invalid":
      return { tone: "invalid", text: `Step ${e.iteration}: ${e.problem}` }
    case "finish":
      return { tone: "done", text: `Done${e.summary ? ` — ${e.summary}` : ""}` }
    case "limit":
      return {
        tone: "limit",
        text: `Stopped at step ${e.iteration} — Continue to keep going.`,
      }
  }
}

/**
 * Pause between the agent loop's model calls. The shared Tile AI service is
 * easily rate-limited, and a Create/Agent run fires several calls back-to-back —
 * spacing them out trades a little latency for far fewer "service unavailable"
 * failures.
 */
const AGENT_STEP_DELAY_MS = 1200

/** The three ways to drive the AI panel. */
type AiMode = "edit" | "agent" | "create"

const AI_MODES: { id: AiMode; label: string; hint: string; tip: string }[] = [
  {
    id: "edit",
    label: "Edit",
    hint: "one-shot rewrite, validated + auto-corrected",
    tip: "Edit: the model rewrites the whole widget + data in one reply. We lint it and, if it's wrong, feed the errors back for a retry (up to 4). Fast and cheap — best for a single, well-scoped change.",
  },
  {
    id: "agent",
    label: "Agent",
    hint: "tool-using loop — the model inspects, lints, commits",
    tip: "Agent: the model works step by step, choosing tools each turn (read state, list data fields, lint, commit). More round-trips, but it can inspect and build up changes — best for multi-step work.",
  },
  {
    id: "create",
    label: "Create",
    hint: "generate a brand-new card from a description",
    tip: "Create: same tool-using loop as Agent, but seeded with a blank card. The model builds the widget and its sample $attrs data from scratch out of your description.",
  },
]

const AI_EXAMPLES: Record<AiMode, string[]> = {
  edit: [
    "Add a red 'High priority' badge next to the title",
    "Show the owner's email as a caption under the name",
    "Add a Notes textarea and include it in the confirm button payload",
  ],
  agent: [
    "Inspect the data, then add a badge for any overdue item",
    "Restructure the card into two columns and lint before committing",
  ],
  create: [
    "A contact card with name, title, email and a 'Call' button",
    "A KPI tile showing revenue, target and percent-to-goal",
  ],
}

function AiEditPanel({
  widget,
  attrs,
  onApply,
}: {
  widget: TileWidgetBundle
  attrs: Record<string, unknown>
  onApply: (widget: TileWidgetBundle, attrs: Record<string, unknown>) => void
}) {
  const client = useMemo(resolveAiClient, [])
  const [mode, setMode] = useState<AiMode>("edit")
  const [instruction, setInstruction] = useState("")
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState<ProgressStep[]>([])
  const [error, setError] = useState<string | null>(null)
  // Auto-scroll the progress list to the newest step as it streams in.
  const logRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [steps])
  // Set when an agent run stops at the step limit with a partial draft. Holds the
  // continuation so the user can opt to keep going instead of losing the work.
  const [pending, setPending] = useState<{ resume: () => Promise<RunAgentResult> } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  if (!client) {
    return (
      <div className="demo-ai demo-ai--off">
        <div className="demo-pane-header">
          <h2>edit with AI</h2>
          <span className="demo-hint">backend not detected</span>
        </div>
        <p className="demo-hint">
          AI editing activates when this viewer runs inside a host that provides
          an AI backend — the Page Host injects one automatically. To wire your
          own, set <code>window.__HXL_AI_CLIENT__</code> to any object with a{" "}
          <code>complete(&#123;prompt, system&#125;)</code> method.
        </p>
      </div>
    )
  }

  // Apply whatever a run produced (partial drafts included) and, if it stopped
  // early, stash the continuation so a Continue button can pick it back up.
  async function handle(
    promise: Promise<{
      widget: TileWidgetBundle
      attrs: Record<string, unknown>
      done?: boolean
      resume?: () => Promise<RunAgentResult>
    }>,
  ) {
    setBusy(true)
    setError(null)
    try {
      const result = await promise
      onApply(result.widget, result.attrs)
      setPending(
        result.done === false && result.resume ? { resume: result.resume } : null,
      )
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message)
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    const text = instruction.trim()
    if (!text || busy) return
    setSteps([])
    setPending(null)
    // A fresh controller per run; resume() (below) reuses this same signal, so we
    // keep abortRef pointing at it while a continuation is pending — Stop still works.
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const onAgent = (e: AgentProgress) => {
      // A commit means a tool just changed the draft — reflect it in the preview
      // right away so the card builds up visibly as the agent works.
      if (e.phase === "commit") onApply(e.widget, e.attrs)
      const step = describeAgentProgress(e)
      if (step) setSteps((prev) => [...prev, step])
    }
    if (mode === "edit") {
      await handle(
        editWidget({
          client: client!,
          widget,
          attrs,
          instruction: text,
          signal: ctrl.signal,
          onProgress: (e) => setSteps((prev) => [...prev, describeEditProgress(e)]),
        }),
      )
    } else if (mode === "agent") {
      await handle(
        runAgent({
          client: client!,
          widget,
          attrs,
          instruction: text,
          stepDelayMs: AGENT_STEP_DELAY_MS,
          signal: ctrl.signal,
          onProgress: onAgent,
        }),
      )
    } else {
      // create — seed a blank card and let the agent build it from scratch.
      await handle(
        createWidget({
          client: client!,
          instruction: text,
          stepDelayMs: AGENT_STEP_DELAY_MS,
          signal: ctrl.signal,
          onProgress: onAgent,
        }),
      )
    }
  }

  // Resume a run that stopped at the step limit. resume() reuses the original
  // run's AbortController (still live in abortRef), so Stop keeps working here.
  async function continueRun() {
    const cont = pending
    if (!cont || busy) return
    setPending(null)
    await handle(cont.resume())
  }

  return (
    <div className="demo-ai">
      <div className="demo-pane-header">
        <h2>edit with AI</h2>
        {busy ? (
          <span className="demo-hint demo-ai-working">
            <span className="demo-ai-spinner" aria-hidden="true" />
            working…
          </span>
        ) : (
          <span className="demo-hint">
            {AI_MODES.find((m) => m.id === mode)!.hint}
          </span>
        )}
      </div>
      <div className="demo-ai-modes" role="tablist">
        {AI_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            title={m.tip}
            className={`demo-ai-mode${mode === m.id ? " active" : ""}`}
            disabled={busy}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="demo-ai-row">
        <input
          className="demo-ai-input"
          type="text"
          value={instruction}
          placeholder={
            mode === "create"
              ? "e.g. a contact card with name, title, email and a 'Call' button"
              : "e.g. add a red 'High priority' badge next to the title"
          }
          disabled={busy}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run()
          }}
        />
        {busy ? (
          <button
            type="button"
            className="demo-ai-btn demo-ai-btn--stop"
            onClick={() => {
              abortRef.current?.abort()
              setPending(null)
            }}
          >
            Stop
          </button>
        ) : (
          <>
            {pending && (
              <button
                type="button"
                className="demo-ai-btn demo-ai-btn--continue"
                onClick={continueRun}
              >
                Continue
              </button>
            )}
            <button
              type="button"
              className="demo-ai-btn"
              onClick={run}
              disabled={!instruction.trim()}
            >
              {mode === "create" ? "Create" : "Generate"}
            </button>
          </>
        )}
      </div>
      {pending && !busy && (
        <p className="demo-hint demo-ai-paused">
          The agent hit its step limit — the preview shows the partial draft. Continue
          to give it more steps, or edit your request and Generate again.
        </p>
      )}
      <div className="demo-ai-examples">
        {AI_EXAMPLES[mode].map((ex) => (
          <button
            key={ex}
            type="button"
            className="demo-ai-chip"
            disabled={busy}
            onClick={() => setInstruction(ex)}
          >
            {ex}
          </button>
        ))}
      </div>
      {error && <p className="demo-error">{error}</p>}
      {steps.length > 0 && (
        <div className="demo-ai-log" ref={logRef}>
          {steps.map((s, i) => (
            <div key={i} className={`demo-ai-step demo-ai-step--${s.tone}`}>
              <span className="demo-ai-step-icon" aria-hidden="true">
                {STEP_ICON[s.tone]}
              </span>
              <span className="demo-ai-step-text">{s.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
