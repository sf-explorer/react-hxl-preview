import { describe, expect, it, vi } from "vitest"
import { runAgent, createWidget, blankWidget } from "./agent"
import { WIDGET_TOOLS } from "./tools"
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

const action = (a: unknown) => JSON.stringify(a)

describe("runAgent tool-using loop", () => {
  it("runs a read → commit → finish trajectory", async () => {
    const newWidget: TileWidgetBundle = {
      ...baseWidget,
      title: "Greeting",
    }
    const client = scriptedClient([
      action({ thought: "inspect", tool: "get_attrs", args: {} }),
      action({ thought: "commit data", tool: "set_attrs", args: { attrs: { name: "Ada" } } }),
      action({ thought: "commit widget", tool: "set_widget", args: { widget: newWidget } }),
      action({ thought: "done", finish: { summary: "renamed the card" } }),
    ])
    const phases: string[] = []
    const result = await runAgent({
      client,
      widget: baseWidget,
      attrs: {},
      instruction: "rename the card to Greeting and set name to Ada",
      onProgress: (e) => phases.push(e.phase),
    })

    expect(result.iterations).toBe(4)
    expect(result.attrs).toEqual({ name: "Ada" })
    expect(result.widget.title).toBe("Greeting")
    expect(result.summary).toBe("renamed the card")
    expect(phases).toContain("observation")
    expect(phases).toContain("finish")
  })

  it("emits a commit event carrying the fresh draft when a tool changes it", async () => {
    const newWidget: TileWidgetBundle = { ...baseWidget, title: "Greeting" }
    const client = scriptedClient([
      // get_attrs reads state — must NOT emit a commit (draft unchanged).
      action({ tool: "get_attrs", args: {} }),
      action({ tool: "set_attrs", args: { attrs: { name: "Ada" } } }),
      action({ tool: "set_widget", args: { widget: newWidget } }),
      action({ finish: { summary: "done" } }),
    ])
    const commits: { tool: string; title: string; attrs: unknown }[] = []
    await runAgent({
      client,
      widget: baseWidget,
      attrs: {},
      instruction: "rename and set data",
      onProgress: (e) => {
        if (e.phase === "commit")
          commits.push({ tool: e.tool, title: e.widget.title, attrs: e.attrs })
      },
    })

    // One commit for set_attrs and one for set_widget — not for the read.
    expect(commits).toEqual([
      { tool: "set_attrs", title: "Card", attrs: { name: "Ada" } },
      { tool: "set_widget", title: "Greeting", attrs: { name: "Ada" } },
    ])
  })

  it("passes the tool catalog and running transcript into each prompt", async () => {
    const client = scriptedClient([
      action({ tool: "get_widget", args: {} }),
      action({ finish: { summary: "no-op" } }),
    ])
    await runAgent({ client, widget: baseWidget, attrs: {}, instruction: "look around" })

    const firstCall = (client.complete as any).mock.calls[0][0]
    expect(firstCall.system).toContain("get_widget")
    expect(firstCall.system).toContain("tile/text") // catalog is present
    // Second prompt must carry the observation from the first tool call.
    const secondPrompt = (client.complete as any).mock.calls[1][0].prompt as string
    expect(secondPrompt).toContain("OBSERVATION:")
  })

  it("rejects an invalid widget on set_widget and lets the model recover", async () => {
    const bogus = { contentBody: { widgetBody: { definition: "tile/bogus" } } }
    const client = scriptedClient([
      action({ tool: "set_widget", args: { widget: bogus } }),
      action({ tool: "set_widget", args: { widget: baseWidget } }),
      action({ finish: { summary: "fixed it" } }),
    ])
    const observations: string[] = []
    const result = await runAgent({
      client,
      widget: baseWidget,
      attrs: {},
      instruction: "x",
      onProgress: (e) => {
        if (e.phase === "observation") observations.push(e.observation)
      },
    })
    expect(observations[0]).toContain("rejected")
    expect(observations[0]).toContain("tile/bogus")
    expect(result.summary).toBe("fixed it")
  })

  it("feeds back an unknown-tool error instead of throwing", async () => {
    const client = scriptedClient([
      action({ tool: "delete_everything", args: {} }),
      action({ finish: {} }),
    ])
    const observations: string[] = []
    await runAgent({
      client,
      widget: baseWidget,
      attrs: {},
      instruction: "x",
      onProgress: (e) => {
        if (e.phase === "observation") observations.push(e.observation)
      },
    })
    expect(observations[0]).toContain("no such tool")
    expect(observations[0]).toContain(WIDGET_TOOLS[0].name)
  })

  it("recovers from a non-JSON reply", async () => {
    const client = scriptedClient([
      "sorry, thinking out loud",
      action({ finish: { summary: "ok" } }),
    ])
    const problems: string[] = []
    const result = await runAgent({
      client,
      widget: baseWidget,
      attrs: {},
      instruction: "x",
      onProgress: (e) => {
        if (e.phase === "invalid") problems.push(e.problem)
      },
    })
    expect(problems.length).toBe(1)
    expect(result.iterations).toBe(2)
  })

  it("createWidget seeds a blank bundle for the model to fill in", async () => {
    const built: TileWidgetBundle = {
      ...blankWidget("Greeting"),
      contentBody: {
        widgetBody: {
          definition: "tile/widget",
          children: [{ definition: "tile/text", attributes: { text: "{!$attrs.name}" } }],
        },
      },
    }
    const client = scriptedClient([
      action({ tool: "set_attrs", args: { attrs: { name: "Ada" } } }),
      action({ tool: "set_widget", args: { widget: built } }),
      action({ finish: { summary: "created a greeting card" } }),
    ])
    const result = await createWidget({
      client,
      title: "Greeting",
      instruction: "a card that greets the person in $attrs.name",
    })

    // The seed handed to the model is an empty, valid widget.
    const firstPrompt = (client.complete as any).mock.calls[0][0].prompt as string
    expect(firstPrompt).toContain("USER REQUEST:")
    expect(result.widget.title).toBe("Greeting")
    expect(result.attrs).toEqual({ name: "Ada" })
    expect(result.summary).toBe("created a greeting card")
  })

  it("nudges a model stuck calling the same tool over and over", async () => {
    const client = scriptedClient([
      action({ tool: "lint_widget", args: { widget: baseWidget } }),
      action({ tool: "lint_widget", args: { widget: baseWidget } }),
      action({ tool: "lint_widget", args: { widget: baseWidget } }),
      action({ finish: { summary: "gave up" } }),
    ])
    const observations: string[] = []
    await runAgent({
      client,
      widget: baseWidget,
      attrs: {},
      instruction: "x",
      onProgress: (e) => {
        if (e.phase === "observation") observations.push(e.observation)
      },
    })
    // First two lints get no nudge; the third trips the loop guard.
    expect(observations[0]).not.toContain("[loop guard]")
    expect(observations[1]).not.toContain("[loop guard]")
    expect(observations[2]).toContain("[loop guard]")
    expect(observations[2]).toContain("finish")
  })

  it("resets the loop-guard streak when the model switches tools", async () => {
    const client = scriptedClient([
      action({ tool: "get_widget", args: {} }),
      action({ tool: "get_attrs", args: {} }),
      action({ tool: "get_widget", args: {} }),
      action({ finish: {} }),
    ])
    const observations: string[] = []
    await runAgent({
      client,
      widget: baseWidget,
      attrs: {},
      instruction: "x",
      onProgress: (e) => {
        if (e.phase === "observation") observations.push(e.observation)
      },
    })
    // Alternating tools never build a streak of 3, so no nudge fires.
    expect(observations.every((o) => !o.includes("[loop guard]"))).toBe(true)
  })

  it("returns a resumable, unfinished result when the budget runs out", async () => {
    const client = scriptedClient([action({ tool: "get_widget", args: {} })])
    const result = await runAgent({
      client,
      widget: baseWidget,
      attrs: {},
      instruction: "x",
      maxIterations: 3,
    })
    expect(client.complete).toHaveBeenCalledTimes(3)
    expect(result.done).toBe(false)
    expect(result.iterations).toBe(3)
    // The partial draft is handed back, not discarded.
    expect(result.widget).toEqual(baseWidget)
    expect(typeof result.resume).toBe("function")
  })

  it("resume() continues from where it stopped and can then finish", async () => {
    const client = scriptedClient([
      action({ tool: "get_widget", args: {} }),
      action({ tool: "get_widget", args: {} }),
      action({ finish: { summary: "done at last" } }),
    ])
    const first = await runAgent({
      client,
      widget: baseWidget,
      attrs: {},
      instruction: "x",
      maxIterations: 2,
    })
    expect(first.done).toBe(false)
    expect(first.iterations).toBe(2)

    const second = await first.resume!()
    expect(second.done).toBe(true)
    expect(second.summary).toBe("done at last")
    // Iteration count keeps climbing across the resume rather than resetting.
    expect(second.iterations).toBe(3)
    expect(client.complete).toHaveBeenCalledTimes(3)
  })

  it("pauses stepDelayMs between turns but not before the first", async () => {
    vi.useFakeTimers()
    try {
      const client = scriptedClient([
        action({ tool: "get_widget", args: {} }),
        action({ finish: { summary: "ok" } }),
      ])
      const done = runAgent({
        client,
        widget: baseWidget,
        attrs: {},
        instruction: "x",
        stepDelayMs: 1000,
      })
      // First call fires with no delay.
      await Promise.resolve()
      expect(client.complete).toHaveBeenCalledTimes(1)
      // Second call is gated behind the 1s pause.
      await vi.advanceTimersByTimeAsync(1000)
      await done
      expect(client.complete).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("aborting during the inter-step pause rejects", async () => {
    vi.useFakeTimers()
    try {
      const ctrl = new AbortController()
      const client = scriptedClient([
        action({ tool: "get_widget", args: {} }),
        action({ finish: {} }),
      ])
      const done = runAgent({
        client,
        widget: baseWidget,
        attrs: {},
        instruction: "x",
        stepDelayMs: 5000,
        signal: ctrl.signal,
      })
      const assertion = expect(done).rejects.toMatchObject({ name: "AbortError" })
      await Promise.resolve()
      ctrl.abort()
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
