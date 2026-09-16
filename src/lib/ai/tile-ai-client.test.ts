import { afterEach, describe, expect, it, vi } from "vitest"
import { createTileAiClient } from "./tile-ai-client"

/** A minimal ok JSON Response stand-in. */
function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}
function jsonErr(status: number, body: unknown = {}) {
  return { ok: false, status, json: async () => body } as unknown as Response
}

function client(fetchImpl: typeof fetch, maxRetries = 2) {
  vi.stubGlobal("fetch", fetchImpl)
  return createTileAiClient({
    baseUrl: "",
    uploadId: 42,
    getToken: () => "tok",
    pollIntervalMs: 2000,
    maxRetries,
  })
}

const isSubmit = (url: unknown) => String(url).endsWith("/api/proxy/llm/42")

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("createTileAiClient retry", () => {
  it("re-submits after a transient job failure and then succeeds", async () => {
    vi.useFakeTimers()
    let submits = 0
    const fetchMock = vi.fn(async (url: unknown) => {
      if (isSubmit(url)) {
        submits++
        return jsonOk({ poll: "/api/proxy/llm/42/status/x" })
      }
      // First job fails transiently; the retried job completes.
      return submits === 1
        ? jsonOk({ status: "failed", error: "AI service unavailable" })
        : jsonOk({ status: "complete", response: "hello" })
    })
    const c = client(fetchMock as unknown as typeof fetch)

    const p = c.complete({ prompt: "x" })
    await vi.advanceTimersByTimeAsync(10_000) // poll + backoff + poll
    await expect(p).resolves.toBe("hello")
    expect(submits).toBe(2)
  })

  it("does NOT retry a non-transient job failure", async () => {
    vi.useFakeTimers()
    let submits = 0
    const fetchMock = vi.fn(async (url: unknown) => {
      if (isSubmit(url)) {
        submits++
        return jsonOk({ poll: "/api/proxy/llm/42/status/x" })
      }
      return jsonOk({ status: "failed", error: "invalid prompt" })
    })
    const c = client(fetchMock as unknown as typeof fetch)

    const p = c.complete({ prompt: "x" })
    const assertion = expect(p).rejects.toThrow(/invalid prompt/)
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    expect(submits).toBe(1)
  })

  it("fails fast on a 401 without retrying", async () => {
    let submits = 0
    const fetchMock = vi.fn(async (url: unknown) => {
      if (isSubmit(url)) {
        submits++
        return jsonErr(401)
      }
      return jsonOk({ status: "complete", response: "x" })
    })
    const c = client(fetchMock as unknown as typeof fetch)

    await expect(c.complete({ prompt: "x" })).rejects.toThrow(/401/)
    expect(submits).toBe(1)
  })
})
