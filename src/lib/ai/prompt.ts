import { catalogReference } from "./catalog"
import type { LintResult } from "./validate"

/**
 * Prompt construction for the widget editor.
 *
 * The system prompt is the narrative half of the hxl-widget-build skill: what an
 * HXL UiWidgetBundle is, the binding grammar, the control-flow meta, and the
 * strict output contract. The catalog block is generated from the live renderer
 * so the model can only reach for components that actually exist.
 */

export const SYSTEM_PROMPT = `You are an expert editor of Salesforce HXL "UiWidgetBundle" (tile/*) widgets.

A widget is a JSON tree. Shape:
{
  "type": "lightning__agentforceWidget",
  "title": "<card title>",
  "contentBody": { "widgetBody": <node> }
}

A node is:
{ "definition": "tile/<name>", "attributes": { ... }, "children": [ <node>, ... ], "meta": { ... } }

BINDINGS — reference data with {!expr}, resolved against the scope:
  - {!$attrs.clientName}          reads the widget's input data ($attrs)
  - inside a forEach, the loop variable is in scope: {!$goal.pct}
  - a whole attribute can be one binding ({!$attrs.rows}) or interpolated text
    ("Owner: {!$attrs.owner}"). Grammar: . [] + - * / % == != < <= > >= && || !

CONTROL FLOW via "meta":
  - "forEach": "{!$attrs.rows}", "forItem": "$row", "forIndex": "$i"  → repeat the node per element
  - "if": "{!$row.isActive}"  → render only when truthy

RULES:
  - Use ONLY the components in the catalog below. Never invent a definition.
  - $attrs is the data contract. Prefer binding to $attrs over hard-coding text,
    so the same widget works for any data. If the user asks for new content that
    needs data, add a field to $attrs AND bind to it.
  - Keep the tree valid JSON. Booleans are true/false, not "true".
  - Preserve parts of the widget the request doesn't mention.

COMPONENT CATALOG:
${catalogReference()}

OUTPUT CONTRACT — respond with ONE JSON object and nothing else (no prose, no
code fences):
{
  "widget": { ...the full updated widget bundle... },
  "attrs":  { ...the full updated $attrs data object... },
  "summary": "one sentence on what you changed"
}
Always return BOTH "widget" and "attrs" in full (not a diff). "summary" is optional.`

/** The first user turn: the request plus the current widget + data. */
export function buildInitialPrompt(
  instruction: string,
  widget: unknown,
  attrs: unknown,
): string {
  return [
    `EDIT REQUEST:\n${instruction}`,
    `\nCURRENT WIDGET:\n${JSON.stringify(widget, null, 2)}`,
    `\nCURRENT $attrs:\n${JSON.stringify(attrs, null, 2)}`,
    `\nReturn the full updated { "widget", "attrs" } JSON object.`,
  ].join("\n")
}

/** A correction turn: replay the bad output and the exact problems to fix. */
export function buildRepairPrompt(rawReply: string, problems: string[]): string {
  return [
    `Your previous reply could not be applied. It was:\n${rawReply}`,
    `\nProblems to fix:`,
    ...problems.map((p) => `  - ${p}`),
    `\nReturn the corrected, complete { "widget", "attrs" } JSON object only.`,
  ].join("\n")
}

/** Flatten lint output into the problem list handed back to the model. */
export function lintProblems(lint: LintResult): string[] {
  return lint.errors
}
