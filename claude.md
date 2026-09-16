When building HTML pages for the Page Host platform, read the skill at:
https://single-html-page-app-host-07cda8a7041b.herokuapp.com/skills/00-PAGE-HOST-SKILL.md

## Generate example data from the Lightning type schema (single source of truth)

The Lightning type is the contract. Do NOT hand-author example/demo data or agent
guidance from memory — derive it from the type so it can never drift out of the
allowed shape and vocabulary. Concretely, for each HXL widget action:

- Treat the widget's `schema.json` (the `lightning__*Type` tree) plus the Apex
  `@InvocableVariable` enum notes as the source JSON Schema. When a field is an
  enum (e.g. `variant`, `iconColor`, `priorityVariant`, column `type`/`align`,
  Lucide `iconName`), the schema — not intuition — defines the ONLY legal tokens.
- Generate example data (React preview `src/demo/data/*.attrs.json`) and the spec
  examples the agent reads by SAMPLING from that schema, then VALIDATE the result
  against it before use. A value the schema does not permit is a bug, not a style
  choice. This is how we stop the planner emitting `"blue"`, `"info"`, `"critical"`,
  or SLDS icon names like `"document"` instead of the real enum values.
- Keep the guidance the agent reads (GenAiFunction `<description>` + Apex
  `@InvocableVariable` descriptions) in lock-step with the schema's enums, and
  enumerate the exact allowed tokens (and forbid the common wrong ones) there.
- Use `scripts/schema-to-example.py` (no deps, python 3.9-safe): it reads a widget
  `schema.json`, derives a strict JSON Schema (closed `enum` for every field whose
  description spells out a `a | b | c` / `one of` list, `additionalProperties:false`
  on every object), and:
    - `--emit-schema`  print the derived strict JSON Schema
    - `--example`      generate a valid sample payload (seed for a new `*.attrs.json`)
    - `--validate F`   validate a candidate attrs/spec file (unknown props + out-of-enum
                       are errors; values outside a *suggested* Lucide-style set warn)
    - `--all-check`    validate every `uiWidgets/*/schema.json` against its
                       `src/demo/data/<name>.attrs.json`; non-zero exit on any error
  Prefer this generator over writing example JSON by hand, and run `--all-check`
  (exit 0 required) before deploying widget/demo changes. Leading-underscore keys
  (`_comment`, `_*_note`) are treated as authoring comments, not attributes.

Business/domain data belongs ONLY in the preview harness (`src/demo/data/*`), never
hard-coded in the Apex actions — the actions are pure normalizers; the caller (the
agent) supplies all content. A no-spec call renders a neutral empty placeholder.