/**
 * Host-agnostic AI backend contract.
 *
 * The viewer edits widgets by talking to *some* text-completion backend, but it
 * never assumes which one. A host plugs in its own `AiClient`: the Page Host
 * Tile AI service (`createTileAiClient`), a direct provider call, a proxy, or a
 * mock in tests. Everything above this line (the agentic widget editor) only
 * ever sees `complete()`.
 */

/** Model quality hint. Adapters map this to whatever their backend exposes. */
export type AiTier = "fast" | "balanced" | "powerful"

/** A single text-completion request. */
export interface AiCompleteOptions {
  /** The full prompt to send. The editor folds conversation history in here. */
  prompt: string
  /** System / role instructions, if the backend supports them. */
  system?: string
  /** Quality hint; adapters may ignore it. */
  tier?: AiTier
  /** Max output tokens. */
  maxTokens?: number
  /** Cancels the in-flight call (and any polling). */
  signal?: AbortSignal
}

/**
 * A text-completion backend. One method, returns the model's text. Implementers
 * should throw an `Error` with a human-readable message on failure so the
 * agentic loop can surface it.
 */
export interface AiClient {
  complete(options: AiCompleteOptions): Promise<string>
}
