import type { HxlExperience } from "../lib"

export interface Fixture {
  name: string
  experience: HxlExperience
  inputs: Record<string, unknown>
}

export const fixtures: Fixture[] = [
  {
    name: "Acceptance — card + field",
    experience: {
      title: "Search",
      root: {
        type: "card",
        props: { title: "{{ inputs.status }}" },
        children: [
          {
            type: "field",
            props: { label: "found", value: "{{ inputs.found }}" },
          },
        ],
      },
    },
    inputs: { status: "idle", found: 0 },
  },
  {
    name: "Composite — tabs with sub-tree",
    experience: {
      title: "Research",
      root: {
        type: "tabs",
        props: {
          items: [
            {
              label: "Overview",
              node: {
                type: "text",
                props: { value: "{{ inputs.summary }}", variant: "body" },
              },
            },
            {
              label: "Details",
              node: {
                type: "stack",
                props: { gap: "tight" },
                children: [
                  { type: "field", props: { label: "Sources", value: "{{ inputs.sources }}" } },
                  { type: "field", props: { label: "Confidence", value: "{{ inputs.confidence }}" } },
                ],
              },
            },
          ],
        },
      },
    },
    inputs: { summary: "Reading sources…", sources: 12, confidence: "high" },
  },
  {
    name: "Kitchen sink",
    experience: {
      title: "{{ inputs.title }}",
      root: {
        type: "stack",
        props: { gap: "wide" },
        children: [
          {
            type: "card",
            props: { title: "Status", variant: "accent" },
            children: [
              {
                type: "stack",
                props: { direction: "row", gap: "wide", justify: "between" },
                children: [
                  { type: "field", props: { label: "State", value: "{{ inputs.state }}" } },
                  { type: "field", props: { label: "Progress", value: "{{ inputs.done }}/{{ inputs.total }}" } },
                ],
              },
              { type: "separator", props: {} },
              { type: "text", props: { value: "{{ inputs.done == inputs.total }}", variant: "muted" } },
            ],
          },
          {
            type: "accordion",
            props: {
              items: [
                {
                  label: "Notes",
                  node: { type: "text", props: { value: "{{ inputs.notes }}", variant: "code" } },
                },
                {
                  label: "Actions",
                  node: {
                    type: "stack",
                    props: { direction: "row", gap: "tight" },
                    children: [
                      { type: "button", props: { label: "Retry", variant: "primary" } },
                      { type: "button", props: { label: "Cancel" } },
                    ],
                  },
                },
              ],
            },
          },
          { type: "mysteryComponent", props: {} },
        ],
      },
    },
    inputs: {
      title: "Job report",
      state: "running",
      done: 3,
      total: 8,
      notes: "retry on 429",
    },
  },
]
