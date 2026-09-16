// Host-agnostic AI editing for HXL tile widgets.
//
// - `AiClient` is the pluggable backend contract.
// - `createTileAiClient` adapts the Page Host "Tile AI" proxy service.
// - `editWidget` runs the propose → validate → repair agentic loop.
// - `runAgent` runs a tool-using (ReAct) loop where the model picks tools.
// - `lintWidgetBundle` is the standalone local linter it uses.

export type { AiClient, AiCompleteOptions, AiTier } from "./types"
export {
  createTileAiClient,
  isTileAiAvailable,
  type TileAiClientConfig,
} from "./tile-ai-client"
export {
  editWidget,
  type EditWidgetParams,
  type EditWidgetResult,
  type EditProgress,
} from "./widget-editor"
export {
  runAgent,
  createWidget,
  blankWidget,
  type CreateWidgetParams,
  type RunAgentParams,
  type RunAgentResult,
  type AgentProgress,
} from "./agent"
export {
  WIDGET_TOOLS,
  attrBindings,
  type AgentTool,
  type AgentDraft,
} from "./tools"
export { lintWidgetBundle, type LintResult } from "./validate"
export {
  TILE_CATALOG,
  KNOWN_TILE_DEFINITIONS,
  catalogReference,
  type TileComponentSpec,
  type TileAttrSpec,
} from "./catalog"
export { SYSTEM_PROMPT } from "./prompt"
export { extractJson } from "./json"
