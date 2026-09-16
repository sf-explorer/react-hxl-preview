import type { TileWidgetBundle } from "../tile/types"
import type { AiClient, AiTier } from "./types"
import { extractJson } from "./json"
import { catalogReference } from "./catalog"
import { WIDGET_TOOLS, type AgentTool, type AgentDraft } from "./tools"

/** Abortable sleep — resolves after `ms`, rejects if `signal` aborts first. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(t)
      reject(
        typeof DOMException !== "undefined"
          ? new DOMException("Aborted", "AbortError")
          : Object.assign(new Error("Aborted"), { name: "AbortError" }),
      )
    }
    if (signal?.aborted) return abort()
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", abort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", abort, { once: true })
  })
}

/**
 * A tool-using (ReAct-style) agent over a plain text-completion backend.
 *
 * `editWidget` is a fixed propose→validate→repair loop: one big JSON blob per
 * turn, the linter as the only (automatic) tool. This loop is the agentic
 * generalisation — the *model* decides, each turn, which tool to call:
 *
 *   1. We send the running transcript + a tool catalog as the prompt.
 *   2. The model replies with ONE JSON action: a tool call, or `finish`.
 *   3. We run the tool locally and append its result as an `Observation:`.
 *   4. Repeat until the model calls `finish` or we hit `maxIterations`.
 *
 * Running out of steps is not a failure: instead of throwing, we hand back the
 * partial draft with `done: false` and a `resume()` that grants a fresh budget
 * from the same transcript — so a host can ask the user whether to keep going.
 *
 * The Page Host proxy has no native function calling (text in, text out), so we
 * keep the conversation transcript ourselves and fold it into `prompt` — exactly
 * what the host docs recommend for chat UIs. Any `AiClient` works; the loop only
 * ever calls `complete()`.
 */

export interface RunAgentParams {
  client: AiClient
  /** Widget bundle to start from. */
  widget: TileWidgetBundle
  /** Current `$attrs` data the widget binds against. */
  attrs: Record<string, unknown>
  /** Natural-language request. */
  instruction: string
  /** Tools the model may call. Default: {@link WIDGET_TOOLS}. */
  tools?: AgentTool[]
  /** Max model round-trips before giving up. Default 8. */
  maxIterations?: number
  /**
   * Pause (ms) between successive model calls, to ease load on a shared/rate-
   * limited backend. Applied before every turn after the first. Default 0 (no
   * pause) — the library imposes no latency; a host opts in. Honours `signal`.
   */
  stepDelayMs?: number
  tier?: AiTier
  maxTokens?: number
  signal?: AbortSignal
  onProgress?: (event: AgentProgress) => void
}

/** A single decoded action the model can emit each turn. */
interface AgentAction {
  thought?: string
  tool?: string
  args?: unknown
  finish?: { summary?: string }
}

export type AgentProgress =
  | { phase: "request"; iteration: number }
  | { phase: "action"; iteration: number; action: AgentAction }
  | { phase: "observation"; iteration: number; tool: string; observation: string }
  /**
   * A tool just mutated the draft (widget and/or attrs reference changed). Carries
   * the fresh draft so a host can update its preview *live*, mid-run, instead of
   * waiting for the whole loop to resolve. Emitted for any draft-changing tool.
   */
  | {
      phase: "commit"
      iteration: number
      tool: string
      widget: TileWidgetBundle
      attrs: Record<string, unknown>
    }
  | { phase: "invalid"; iteration: number; problem: string }
  | { phase: "finish"; iteration: number; summary?: string }
  | { phase: "limit"; iteration: number }

export interface RunAgentResult {
  widget: TileWidgetBundle
  attrs: Record<string, unknown>
  summary?: string
  /** How many model round-trips it took (total, across any resumes). */
  iterations: number
  /**
   * `true` if the model called `finish`; `false` if it ran out of steps with a
   * partial draft still on the table. When `false`, `widget`/`attrs` hold that
   * partial draft (safe to preview) and {@link resume} is available.
   */
  done: boolean
  /**
   * Present only when `done` is `false`. Runs another `maxIterations`-step batch
   * from exactly where it left off — same transcript, same draft — so a host can
   * ask the user "keep going?" instead of discarding the work. Resolves to a
   * fresh {@link RunAgentResult}, which may itself be resumable if it hits the
   * limit again. Do not call more than once (each call advances shared state).
   */
  resume?: () => Promise<RunAgentResult>
}

const AGENT_SYSTEM = `You are an expert editor of Salesforce HXL "UiWidgetBundle" (tile/*) widgets, working as a tool-using agent.

Each turn, reply with ONE JSON object and NOTHING else (no prose, no code fences). Either call a tool:
  { "thought": "why this step", "tool": "<name>", "args": { ... } }
or finish once the widget and attrs are committed:
  { "thought": "why you are done", "finish": { "summary": "one sentence on what you changed" } }

Work incrementally: inspect state, build a candidate, lint it, then commit with set_widget / set_attrs. Only "finish" AFTER you have committed every change you intend — the current draft is what ships. Prefer binding widget attributes to $attrs (e.g. "{!$attrs.name}") over hard-coding text.

DATA IS PART OF THE CARD. A widget that binds to $attrs renders BLANK without matching data. So after set_widget, call list_data_fields to see which fields your bindings need, then set_attrs with realistic sample values for every one of them. Do not finish while any field is missing.

COMPONENT CATALOG (use ONLY these definitions):
${catalogReference()}`

/** A valid, empty widget bundle — the seed the agent fills in when creating. */
export function blankWidget(title = "New card"): TileWidgetBundle {
  return {
    type: "lightning__agentforceWidget",
    title,
    contentBody: { widgetBody: { definition: "tile/widget", children: [] } },
  }
}

export interface CreateWidgetParams
  extends Omit<RunAgentParams, "widget" | "attrs"> {
  /** Starting title for the blank card. Default "New card". */
  title?: string
  /** Optional sample/seed data to bind against. Default `{}`. */
  attrs?: Record<string, unknown>
}

/**
 * Generate a brand-new widget from a natural-language description.
 *
 * Same tool-using loop as {@link runAgent}, seeded with a {@link blankWidget}
 * (and optional sample `attrs`) instead of an existing bundle. The model reads
 * the empty tree, builds children, lints, and commits — no separate machinery.
 */
export function createWidget({
  title,
  attrs = {},
  ...rest
}: CreateWidgetParams): Promise<RunAgentResult> {
  return runAgent({ ...rest, widget: blankWidget(title), attrs })
}

export async function runAgent({
  client,
  widget,
  attrs,
  instruction,
  tools = WIDGET_TOOLS,
  maxIterations = 8,
  stepDelayMs = 0,
  tier,
  maxTokens = 4000,
  signal,
  onProgress,
}: RunAgentParams): Promise<RunAgentResult> {
  const draft: AgentDraft = { widget, attrs }
  const toolDocs = tools.map((t) => `- ${t.name} ${t.args}: ${t.description}`).join("\n")
  const system = `${AGENT_SYSTEM}\n\nTOOLS:\n${toolDocs}`

  // We maintain the conversation ourselves — the backend is stateless text I/O.
  const transcript: string[] = [
    `USER REQUEST:\n${instruction}`,
    `\nStarting widget and $attrs are available via get_widget / get_attrs.`,
  ]

  // Total model round-trips so far. Persists across resume() calls, so a partial
  // run that is resumed keeps counting from where it stopped rather than resetting.
  let completed = 0

  // One `maxIterations`-step batch, continuing from the shared transcript/draft.
  // resume() just calls this again, granting a fresh budget on top of what ran.
  async function runBatch(): Promise<RunAgentResult> {
    const budget = completed + maxIterations
    // Livelock guard: track how many times in a row the model has called the
    // SAME tool. No legitimate trajectory lints (or reads) the same thing three
    // times running — that's a model stuck re-checking instead of committing.
    let lastTool: string | undefined
    let sameToolStreak = 0
    for (let iteration = completed + 1; iteration <= budget; iteration++) {
      if (iteration > 1) await sleep(stepDelayMs, signal)
      onProgress?.({ phase: "request", iteration })

      const reply = await client.complete({
        prompt: transcript.join("\n\n"),
        system,
        tier,
        maxTokens,
        signal,
      })
      completed = iteration

      let action: AgentAction
      try {
        action = extractJson(reply) as AgentAction
        if (!action || typeof action !== "object") throw new Error("not an object")
      } catch (e) {
        const problem = `reply was not a valid JSON action: ${(e as Error).message}`
        onProgress?.({ phase: "invalid", iteration, problem })
        transcript.push(`ASSISTANT:\n${reply}`, `OBSERVATION:\n${problem} — reply with one JSON action.`)
        continue
      }
      onProgress?.({ phase: "action", iteration, action })

      if (action.finish) {
        onProgress?.({ phase: "finish", iteration, summary: action.finish.summary })
        return {
          widget: draft.widget,
          attrs: draft.attrs,
          summary: action.finish.summary,
          iterations: iteration,
          done: true,
        }
      }

      const tool = action.tool ? tools.find((t) => t.name === action.tool) : undefined
      let observation: string
      // Snapshot the draft refs so we can tell whether the tool actually committed
      // a change (tools mutate the draft in place, swapping the reference).
      const prevWidget = draft.widget
      const prevAttrs = draft.attrs
      if (!tool) {
        observation = `error: no such tool "${action.tool ?? ""}". Available: ${tools
          .map((t) => t.name)
          .join(", ")}. Reply with a tool call or finish.`
      } else {
        observation = tool.run(action.args ?? {}, draft)
      }

      // Detect a stuck run and steer it back toward committing / finishing.
      if (action.tool && action.tool === lastTool) sameToolStreak++
      else {
        lastTool = action.tool
        sameToolStreak = 1
      }
      if (sameToolStreak >= 3) {
        observation += `\n\n[loop guard] You have called ${action.tool} ${sameToolStreak} times in a row without progressing. Reading and linting do NOT change the draft. If the widget is valid, commit it with set_widget, then set_attrs for any missing fields, then finish. If you cannot make progress, finish now with what you have.`
      }

      onProgress?.({ phase: "observation", iteration, tool: action.tool ?? "", observation })
      // If the draft actually changed, surface it so hosts can preview live.
      if (draft.widget !== prevWidget || draft.attrs !== prevAttrs) {
        onProgress?.({
          phase: "commit",
          iteration,
          tool: action.tool ?? "",
          widget: draft.widget,
          attrs: draft.attrs,
        })
      }
      // Record a COMPACT action line, not the raw reply — a set_widget reply carries
      // the whole widget JSON, which would bloat every later prompt. The observation
      // already confirms what happened, and the model can get_widget to re-read state.
      transcript.push(`ASSISTANT: called ${action.tool ?? "?"}`, `OBSERVATION:\n${observation}`)
    }

    // Out of budget with a still-unfinished draft. Don't discard it: hand back the
    // partial work plus a resume() so the caller can ask the user to keep going.
    onProgress?.({ phase: "limit", iteration: completed })
    return {
      widget: draft.widget,
      attrs: draft.attrs,
      iterations: completed,
      done: false,
      resume: runBatch,
    }
  }

  return runBatch()
}
