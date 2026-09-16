import type { TileWidgetBundle } from "../tile/types"
import type { AiClient, AiTier } from "./types"
import { extractJson } from "./json"
import { lintWidgetBundle } from "./validate"
import {
  SYSTEM_PROMPT,
  buildInitialPrompt,
  buildRepairPrompt,
  lintProblems,
} from "./prompt"

/**
 * The agentic widget editor.
 *
 * One turn is: prompt the model → extract its JSON → lint it locally → if the
 * lint has errors, feed them back and try again. It loops up to `maxIterations`
 * times, so a model that fumbles the schema on the first pass gets a chance to
 * self-correct from a precise, machine-generated error list rather than us
 * silently rendering a broken card.
 *
 * The backend is any `AiClient` — the loop knows nothing about which host or
 * provider is behind it.
 */

export interface EditWidgetParams {
  client: AiClient
  /** The widget bundle being edited. */
  widget: TileWidgetBundle
  /** The current `$attrs` data the widget binds against. */
  attrs: Record<string, unknown>
  /** Natural-language edit request. */
  instruction: string
  /** Max propose→validate→repair rounds. Default 4. */
  maxIterations?: number
  tier?: AiTier
  maxTokens?: number
  signal?: AbortSignal
  /** Streamed progress for a live log. */
  onProgress?: (event: EditProgress) => void
}

export type EditProgress =
  | { phase: "request"; iteration: number }
  | { phase: "reply"; iteration: number; text: string }
  | { phase: "invalid"; iteration: number; problems: string[] }
  | { phase: "applied"; iteration: number; summary?: string; warnings: string[] }

export interface EditWidgetResult {
  widget: TileWidgetBundle
  attrs: Record<string, unknown>
  summary?: string
  warnings: string[]
  /** How many model round-trips it took. */
  iterations: number
}

export async function editWidget({
  client,
  widget,
  attrs,
  instruction,
  maxIterations = 4,
  tier,
  maxTokens = 4000,
  signal,
  onProgress,
}: EditWidgetParams): Promise<EditWidgetResult> {
  let prompt = buildInitialPrompt(instruction, widget, attrs)
  const problemsSeen: string[] = []

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    onProgress?.({ phase: "request", iteration })

    const reply = await client.complete({
      prompt,
      system: SYSTEM_PROMPT,
      tier,
      maxTokens,
      signal,
    })
    onProgress?.({ phase: "reply", iteration, text: reply })

    const problems = validateReply(reply, widget)
    if (problems.result) {
      const { widget: nextWidget, attrs: nextAttrs, summary, warnings } = problems.result
      onProgress?.({ phase: "applied", iteration, summary, warnings })
      return { widget: nextWidget, attrs: nextAttrs, summary, warnings, iterations: iteration }
    }

    onProgress?.({ phase: "invalid", iteration, problems: problems.problems })
    problemsSeen.push(...problems.problems)

    if (iteration === maxIterations) break
    prompt = buildRepairPrompt(reply, problems.problems)
  }

  throw new Error(
    `AI could not produce a valid widget after ${maxIterations} attempts. Last problems:\n` +
      dedupe(problemsSeen).map((p) => `  - ${p}`).join("\n"),
  )
}

interface ValidatedReply {
  result?: {
    widget: TileWidgetBundle
    attrs: Record<string, unknown>
    summary?: string
    warnings: string[]
  }
  problems: string[]
}

/** Parse + lint a single model reply. On success, `result` is populated. */
function validateReply(reply: string, current: TileWidgetBundle): ValidatedReply {
  let parsed: any
  try {
    parsed = extractJson(reply)
  } catch (e) {
    return { problems: [`reply is not valid JSON: ${(e as Error).message}`] }
  }

  if (!parsed || typeof parsed !== "object") {
    return { problems: ['reply must be a JSON object with "widget" and "attrs"'] }
  }

  // The model may edit only the data and echo the widget, or vice versa; fall
  // back to the current widget so a partial-but-valid reply still applies.
  const widget = (parsed.widget ?? current) as TileWidgetBundle
  if (parsed.attrs != null && (typeof parsed.attrs !== "object" || Array.isArray(parsed.attrs))) {
    return { problems: ['"attrs" must be a JSON object'] }
  }
  const attrs = (parsed.attrs ?? {}) as Record<string, unknown>

  const lint = lintWidgetBundle(widget)
  if (lint.errors.length > 0) {
    return { problems: lintProblems(lint) }
  }

  return {
    result: {
      widget,
      attrs,
      summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
      warnings: lint.warnings,
    },
    problems: [],
  }
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items))
}
