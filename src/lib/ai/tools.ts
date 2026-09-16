import type { TileWidgetBundle } from "../tile/types"
import { lintWidgetBundle } from "./validate"

/**
 * The tool set the {@link runAgent} loop exposes to the model.
 *
 * The Page Host proxy is text-in / text-out (see tile-ai-client.ts) — it has no
 * native function calling. So tools are expressed as *text*: the model emits a
 * JSON action naming a tool, the loop runs the tool locally, and the returned
 * string is fed back as an `Observation:`. Every tool therefore takes parsed
 * JSON args and returns a plain-string observation, and its `run` never throws —
 * a bad call becomes an observation the model can recover from.
 *
 * Tools mutate a shared {@link AgentDraft}: the widget + attrs being built up.
 * `set_widget` / `set_attrs` are how the model commits changes; the loop reads
 * the draft when the model calls `finish`.
 */

/** The mutable state a tool run reads and writes. */
export interface AgentDraft {
  widget: TileWidgetBundle
  attrs: Record<string, unknown>
}

export interface AgentTool {
  name: string
  /** One-line description rendered into the system prompt. */
  description: string
  /** Human-readable args shape, rendered into the system prompt. */
  args: string
  /** Run the tool. Must not throw; return an error string instead. */
  run(args: any, draft: AgentDraft): string
}

/** Best-effort JSON stringify that never throws (circular refs → message). */
function show(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch (e) {
    return `<unserialisable: ${(e as Error).message}>`
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/**
 * Every `$attrs.<path>` a widget binds to, deduped and sorted.
 *
 * We stringify the whole bundle and scan it, so bindings are caught wherever
 * they live — attribute values, interpolated text, `meta.forEach` / `meta.if`,
 * the title. Paths keep their dots/indexes (`owner.email`, `rows[0].name`).
 */
export function attrBindings(widget: unknown): string[] {
  const json = JSON.stringify(widget ?? null)
  const found = new Set<string>()
  for (const m of json.matchAll(/\$attrs\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+|\[\d+\])*)/g)) {
    found.add(m[1])
  }
  return [...found].sort()
}

/** The top-level key of a binding path (`owner.email` → `owner`). */
function topLevelKey(path: string): string {
  return path.split(/[.[]/)[0]
}

/**
 * The widget-editing tool set. Ordered from read → validate → commit, which is
 * also the order we want the model to reach for them.
 */
export const WIDGET_TOOLS: AgentTool[] = [
  {
    name: "get_widget",
    description: "Read the current widget bundle JSON.",
    args: "{}",
    run: (_args, draft) => show(draft.widget),
  },
  {
    name: "get_attrs",
    description: "Read the current $attrs data object the widget binds against.",
    args: "{}",
    run: (_args, draft) => show(draft.attrs),
  },
  {
    name: "lint_widget",
    description:
      "Optional pre-check: validate a candidate WITHOUT committing. set_widget already lints and safely REJECTS an invalid bundle (returning the same errors) without touching the draft, so you can usually skip straight to set_widget.",
    args: '{ "widget": <full widget bundle> }',
    run: (args) => {
      if (!isPlainObject(args) || !("widget" in args)) {
        return 'error: expected { "widget": <bundle> }'
      }
      const lint = lintWidgetBundle(args.widget)
      // A clean lint is a dead-end unless we say what to do next: models tend to
      // re-lint the same bundle forever instead of committing. Push to set_widget.
      if (lint.errors.length === 0) {
        const warn = lint.warnings.length ? ` (warnings: ${lint.warnings.join("; ")})` : ""
        return `no errors${warn} — do NOT lint again; commit this exact widget now with set_widget (it re-lints on commit).`
      }
      return show(lint)
    },
  },
  {
    name: "list_data_fields",
    description:
      "List every $attrs.* field the current widget binds to and which top-level keys are still MISSING from the committed attrs. Call this after building the widget so the data section matches — then set_attrs the missing ones with realistic sample values.",
    args: "{}",
    run: (_args, draft) => {
      const referenced = attrBindings(draft.widget)
      if (referenced.length === 0) {
        return "no $attrs bindings in the widget yet — nothing to supply"
      }
      const present = new Set(Object.keys(draft.attrs))
      const missing = [...new Set(referenced.map(topLevelKey))].filter(
        (k) => !present.has(k),
      )
      return show({ referenced, missing, hasData: [...present] })
    },
  },
  {
    name: "set_widget",
    description:
      "Commit a new widget bundle. Rejected (with the lint errors) if it does not pass the linter, so the draft is never left invalid.",
    args: '{ "widget": <full widget bundle> }',
    run: (args, draft) => {
      if (!isPlainObject(args) || !("widget" in args)) {
        return 'error: expected { "widget": <bundle> }'
      }
      const lint = lintWidgetBundle(args.widget)
      if (lint.errors.length > 0) {
        return `rejected — fix these errors then call set_widget again:\n${lint.errors
          .map((e) => `  - ${e}`)
          .join("\n")}`
      }
      draft.widget = args.widget as TileWidgetBundle
      const warn = lint.warnings.length
        ? ` (warnings: ${lint.warnings.join("; ")})`
        : ""
      return `ok — widget committed${warn}. Next: list_data_fields, then set_attrs any missing fields, then finish.`
    },
  },
  {
    name: "set_attrs",
    description:
      "Commit a new $attrs data object (the full object, not a diff). Bind to these fields from the widget.",
    args: '{ "attrs": <object> }',
    run: (args, draft) => {
      if (!isPlainObject(args) || !isPlainObject((args as any).attrs)) {
        return 'error: expected { "attrs": <object> }'
      }
      draft.attrs = (args as any).attrs
      return "ok — attrs committed"
    },
  },
]
