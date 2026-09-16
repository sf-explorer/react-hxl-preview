import type { AiClient, AiCompleteOptions } from "./types"

/**
 * Adapter for the Page Host "Tile AI" service.
 * See: /skills/11-TILE-AI-SERVICE.md on the host.
 *
 * The host injects two globals into every tile at load time:
 *   window.__UPLOAD_ID__   — the tile's numeric id
 *   window.__PROXY_TOKEN__ — a 30-minute session token (refreshed on open)
 *
 * Calls authenticate with the `X-Proxy-Token` header. We always use async mode
 * (`X-Async: true`): submit returns a job + poll URL, then we poll every 2s.
 * Async is the service's recommended path and dodges Heroku's 30s router H12.
 *
 * Nothing here is hard-wired to Heroku: `baseUrl` and the token/id resolvers are
 * all configurable, so the same client plugs into any host that speaks this
 * proxy protocol.
 */

declare global {
  interface Window {
    __UPLOAD_ID__?: string | number
    __PROXY_TOKEN__?: string
  }
}

export interface TileAiClientConfig {
  /**
   * Origin the proxy lives on. Default `""` (same-origin) — correct when the
   * tile is served *by* the host, since the poll URL it returns is relative.
   */
  baseUrl?: string
  /** Tile id. Default: `window.__UPLOAD_ID__`, read lazily per call. */
  uploadId?: string | number
  /** Token resolver. Default reads `window.__PROXY_TOKEN__` fresh each call. */
  getToken?: () => string | undefined
  /** Default tier when a call omits one. */
  tier?: AiCompleteOptions["tier"]
  /** Default max tokens when a call omits one. Service ceiling is 4000. */
  maxTokens?: number
  /** Poll cadence in ms (service guidance: 2000). */
  pollIntervalMs?: number
  /** Overall budget in ms before giving up. */
  timeoutMs?: number
  /**
   * Times to re-submit after a *transient* failure (service unavailable, all
   * providers down, rate limit). Default 2. Retries use exponential backoff and
   * only fire for transient errors — a bad request or expired token fails fast.
   */
  maxRetries?: number
}

/**
 * True when the Tile AI globals are present — i.e. we're running inside a tile
 * hosted on the Page Host. The demo uses this to decide whether to offer AI
 * editing at all.
 */
export function isTileAiAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.__UPLOAD_ID__ != null &&
    typeof window.__PROXY_TOKEN__ === "string" &&
    window.__PROXY_TOKEN__.length > 0
  )
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(abortError())
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function abortError(): Error {
  return typeof DOMException !== "undefined"
    ? new DOMException("Aborted", "AbortError")
    : Object.assign(new Error("Aborted"), { name: "AbortError" })
}

/**
 * A transient error is worth re-submitting: the request was fine, the service
 * was momentarily unable to serve it. We tag those on the Error so the retry
 * wrapper can tell them apart from permanent failures (bad request, 401, 404).
 */
class TransientAiError extends Error {
  readonly transient = true
}

/** Does this job-failure / http message describe a retryable outage? */
function isTransientMessage(msg: string): boolean {
  return /unavailable|overloaded|temporarily|try again|all model providers|rate limit|timed out/i.test(
    msg,
  )
}

async function httpError(res: Response, stage: string): Promise<Error> {
  const detail = await res
    .json()
    .then((b) => (b && typeof b.error === "string" ? b.error : ""))
    .catch(() => "")
  const known: Record<number, string> = {
    401: "token expired — reload the tile",
    404: "no LLM connection registered on this tile",
    429: "rate limit hit — wait a minute",
    503: "all model providers failed",
  }
  const hint = known[res.status] ? ` (${known[res.status]})` : ""
  const message = `Tile AI ${stage} failed: ${res.status}${hint}${detail ? ` — ${detail}` : ""}`
  // 429 (rate limit), 503 (providers down), and 5xx are worth a retry.
  return res.status === 429 || res.status >= 500
    ? new TransientAiError(message)
    : new Error(message)
}

export function createTileAiClient(config: TileAiClientConfig = {}): AiClient {
  const baseUrl = (config.baseUrl ?? "").replace(/\/+$/, "")
  const pollIntervalMs = config.pollIntervalMs ?? 2000
  const timeoutMs = config.timeoutMs ?? 120_000
  const getUploadId = () =>
    config.uploadId ?? (typeof window !== "undefined" ? window.__UPLOAD_ID__ : undefined)
  const getToken =
    config.getToken ??
    (() => (typeof window !== "undefined" ? window.__PROXY_TOKEN__ : undefined))

  const maxRetries = config.maxRetries ?? 2

  async function attempt({
    prompt,
    system,
    tier,
    maxTokens,
    signal,
  }: AiCompleteOptions): Promise<string> {
    const uploadId = getUploadId()
    if (uploadId == null) {
      throw new Error(
        "Tile AI unavailable: no upload id (window.__UPLOAD_ID__). Host the tile on the Page Host, or pass `uploadId`.",
      )
    }
    const token = getToken()
    if (!token) {
      throw new Error(
        "Tile AI unavailable: no proxy token (window.__PROXY_TOKEN__). Reload the tile.",
      )
    }

    // Step 1 — submit (async).
    const submit = await fetch(`${baseUrl}/api/proxy/llm/${uploadId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Proxy-Token": token,
        "X-Async": "true",
      },
      body: JSON.stringify({
        prompt,
        system,
        tier: tier ?? config.tier ?? "balanced",
        maxTokens: maxTokens ?? config.maxTokens ?? 1000,
      }),
      signal,
    })
    if (!submit.ok) throw await httpError(submit, "submit")
    const job = await submit.json()
    if (!job?.poll) throw new Error("Tile AI submit returned no poll URL")

    // Step 2 — poll until complete. The service tries 3 providers + a Heroku
    // fallback server-side, so we submit once and never cascade tiers here.
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await delay(pollIntervalMs, signal)
      const res = await fetch(`${baseUrl}${job.poll}`, {
        headers: { "X-Proxy-Token": getToken() ?? token },
        signal,
      })
      if (!res.ok) throw await httpError(res, "poll")
      const status = await res.json()
      if (status.status === "complete") return String(status.response ?? "")
      if (status.status === "failed") {
        const err = String(status.error ?? "unknown error")
        const message = `Tile AI failed: ${err}`
        throw isTransientMessage(err) ? new TransientAiError(message) : new Error(message)
      }
    }
    throw new Error(`Tile AI timed out after ${Math.round(timeoutMs / 1000)}s`)
  }

  /**
   * Submit once; on a *transient* failure, back off and re-submit up to
   * `maxRetries` times. Backoff is exponential (1s, 2s, 4s, …) so a brief host
   * outage recovers without hammering the service. Non-transient errors and
   * aborts propagate immediately.
   */
  async function complete(options: AiCompleteOptions): Promise<string> {
    let lastError: unknown
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await attempt(options)
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw e
        if (!(e instanceof TransientAiError) || i === maxRetries) throw e
        lastError = e
        await delay(1000 * 2 ** i, options.signal)
      }
    }
    throw lastError // unreachable, but keeps the type checker happy
  }

  return { complete }
}
