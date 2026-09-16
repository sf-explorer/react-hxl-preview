import { describe, expect, it, vi } from "vitest"
import { editWidget } from "./widget-editor"
import { extractJson } from "./json"
import type { AiClient } from "./types"
import type { TileWidgetBundle } from "../tile/types"

const baseWidget: TileWidgetBundle = {
  type: "lightning__agentforceWidget",
  title: "Card",
  contentBody: {
    widgetBody: {
      definition: "tile/widget",
      children: [{ definition: "tile/text", attributes: { text: "{!$attrs.name}" } }],
    },
  },
}

/** A client that replays a fixed script of replies, one per call. */
function scriptedClient(replies: string[]): AiClient {
  let i = 0
  return { complete: vi.fn(async () => replies[Math.min(i++, replies.length - 1)]) }
}

const goodReply = JSON.stringify({
  widget: baseWidget,
  attrs: { name: "Ada" },
  summary: "set the name",
})

describe("editWidget agentic loop", () => {
  it("applies a valid reply on the first attempt", async () => {
    const client = scriptedClient([goodReply])
    const result = await editWidget({
      client,
      widget: baseWidget,
      attrs: {},
      instruction: "set the name to Ada",
    })
    expect(result.iterations).toBe(1)
    expect(result.attrs).toEqual({ name: "Ada" })
    expect(result.summary).toBe("set the name")
  })

  it("feeds lint errors back and recovers on a later attempt", async () => {
    // Attempt 1: unknown tile → lint error. Attempt 2: valid.
    const badReply = JSON.stringify({
      widget: {
        contentBody: { widgetBody: { definition: "tile/bogus" } },
      },
      attrs: {},
    })
    const client = scriptedClient([badReply, goodReply])
    const problems: string[][] = []
    const result = await editWidget({
      client,
      widget: baseWidget,
      attrs: {},
      instruction: "x",
      onProgress: (e) => {
        if (e.phase === "invalid") problems.push(e.problems)
      },
    })
    expect(result.iterations).toBe(2)
    expect(client.complete).toHaveBeenCalledTimes(2)
    expect(problems[0].some((p) => p.includes("tile/bogus"))).toBe(true)
    // The repair prompt must carry the problems back to the model.
    const secondPrompt = (client.complete as any).mock.calls[1][0].prompt as string
    expect(secondPrompt).toContain("tile/bogus")
  })

  it("recovers from non-JSON output", async () => {
    const client = scriptedClient(["sorry, here you go: " + goodReply])
    const result = await editWidget({
      client,
      widget: baseWidget,
      attrs: {},
      instruction: "x",
    })
    expect(result.attrs).toEqual({ name: "Ada" })
  })

  it("throws after exhausting the retry budget", async () => {
    const client = scriptedClient(["not json at all"])
    await expect(
      editWidget({
        client,
        widget: baseWidget,
        attrs: {},
        instruction: "x",
        maxIterations: 2,
      }),
    ).rejects.toThrow(/could not produce a valid widget after 2 attempts/)
    expect(client.complete).toHaveBeenCalledTimes(2)
  })
})

describe("extractJson", () => {
  it("reads a fenced block", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it("reads the first balanced object amid prose", () => {
    expect(extractJson('Here: {"a":{"b":2}} done')).toEqual({ a: { b: 2 } })
  })
  it("ignores braces inside strings", () => {
    expect(extractJson('{"a":"}{ not real"}')).toEqual({ a: "}{ not real" })
  })
})
