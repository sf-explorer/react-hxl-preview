import "./styles.css"

export {
  evaluateExpression,
  evaluateBinding,
  evaluateValue,
} from "./expression"
export {
  createHxlRegistry,
  createDefaultHxlRegistry,
} from "./registry"
export { defaultComponents } from "./components"
export { HxlRenderer, HxlSurface } from "./renderer"
export type { HxlRendererProps, HxlSurfaceProps } from "./renderer"
export { useHxlContext } from "./context"

// Salesforce UiWidgetBundle (tile/*) dialect
export {
  TileWidgetRenderer,
  createTileRegistry,
  createDefaultTileRegistry,
  defaultTileComponents,
  TileInteractionProvider,
  useTileInteraction,
  useField,
  evaluateTileBinding,
  evaluateTileValue,
} from "./tile"
export type {
  DispatchedEvent,
  TileWidgetRendererProps,
  TileValue,
  TileMeta,
  TileNode,
  TileWidgetBundle,
  TileScope,
  TileComponentProps,
  TileComponentType,
  TileComponentRegistry,
} from "./tile"

export type {
  HxlValue,
  HxlComponentNode,
  HxlExperience,
  HxlItem,
  EvalContext,
  HxlComponentProps,
  HxlComponentType,
  HxlComponentRegistry,
  HxlRenderContext,
} from "./types"

// Host-agnostic AI widget editing (pluggable backend + agentic loop)
export {
  createTileAiClient,
  isTileAiAvailable,
  editWidget,
  runAgent,
  createWidget,
  blankWidget,
  WIDGET_TOOLS,
  lintWidgetBundle,
  TILE_CATALOG,
  KNOWN_TILE_DEFINITIONS,
  catalogReference,
  SYSTEM_PROMPT,
  extractJson,
} from "./ai"
export type {
  AiClient,
  AiCompleteOptions,
  AiTier,
  TileAiClientConfig,
  EditWidgetParams,
  EditWidgetResult,
  EditProgress,
  RunAgentParams,
  RunAgentResult,
  CreateWidgetParams,
  AgentProgress,
  AgentTool,
  AgentDraft,
  LintResult,
  TileComponentSpec,
  TileAttrSpec,
} from "./ai"
